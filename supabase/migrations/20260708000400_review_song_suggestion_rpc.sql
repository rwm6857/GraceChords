-- =============================================================================
-- GraceChords: review_song_suggestion RPC (2026-07-08)
--
-- Atomic, editor-gated approve/reject. Runs SECURITY DEFINER because publishing
-- crosses ownership boundaries the client can't: the reviewer is not the draft
-- owner, so only a definer function may flip personal_songs.status. This also
-- centralizes the three partial writes the web client does today and fixes the
-- deletion bug (approving a deletion now actually sets is_deleted = true).
-- =============================================================================

-- Slug helper: base slug from a title, disambiguated against public.songs.
CREATE OR REPLACE FUNCTION public.gc_next_song_slug(p_title text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_base      text;
  v_candidate text;
  v_n         int := 2;
BEGIN
  v_base := trim(both '_' from
    regexp_replace(regexp_replace(lower(coalesce(p_title,'')), '[^a-z0-9]+', '_', 'g'), '_+', '_', 'g'));
  IF v_base = '' THEN v_base := 'untitled'; END IF;
  v_candidate := v_base;
  WHILE EXISTS (SELECT 1 FROM public.songs WHERE slug = v_candidate) LOOP
    v_candidate := v_base || '_' || v_n;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_song_suggestion(
  p_suggestion_id uuid,
  p_action        text,
  p_reason        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor   uuid := auth.uid();
  v_sug     public.song_suggestions%ROWTYPE;
  v_payload jsonb;
  v_tags    text[];
  v_slug    text;
  v_song_id uuid;
BEGIN
  IF NOT public.has_min_role('editor') THEN
    RAISE EXCEPTION 'Only editors and above can review suggestions';
  END IF;
  IF p_action NOT IN ('approve','reject') THEN
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  SELECT * INTO v_sug FROM public.song_suggestions WHERE id = p_suggestion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Suggestion not found';
  END IF;
  IF v_sug.status <> 'pending' THEN
    RAISE EXCEPTION 'Suggestion already reviewed';
  END IF;

  v_payload := coalesce(v_sug.payload, '{}'::jsonb);
  v_tags := coalesce(
    (SELECT array_agg(value) FROM jsonb_array_elements_text(coalesce(v_payload->'tags','[]'::jsonb)) AS value),
    '{}'::text[]);

  -- ---- Reject ---------------------------------------------------------------
  IF p_action = 'reject' THEN
    UPDATE public.song_suggestions
      SET status='rejected', reviewed_by=v_actor, reviewed_at=now(), rejection_reason=p_reason
      WHERE id = p_suggestion_id;
    IF v_sug.personal_song_id IS NOT NULL THEN
      UPDATE public.personal_songs SET status='draft'
        WHERE id = v_sug.personal_song_id AND status='submitted';
    END IF;
    INSERT INTO public.editor_audit_log(actor_id, action, song_id, note)
      VALUES (v_actor, 'rejected', v_sug.song_id, p_reason);
    RETURN jsonb_build_object('status','rejected');
  END IF;

  -- ---- Approve --------------------------------------------------------------
  IF v_sug.type = 'deletion' THEN
    UPDATE public.songs
      SET is_deleted=true, updated_at=now(), updated_by=v_actor
      WHERE id = v_sug.song_id;
    v_song_id := v_sug.song_id;

  ELSIF v_sug.type = 'edit' THEN
    v_song_id := v_sug.song_id;  -- published target
    UPDATE public.songs SET
      title            = coalesce(v_payload->>'title', title),
      artist           = v_payload->>'artist',
      default_key      = v_payload->>'default_key',
      tempo            = nullif(v_payload->>'tempo','')::int,
      time_signature   = v_payload->>'time_signature',
      country          = v_payload->>'country',
      youtube_id       = v_payload->>'youtube_id',
      language         = v_payload->>'language',
      pptx_url         = v_payload->>'pptx_url',
      tags             = v_tags,
      chordpro_content = coalesce(v_payload->>'chordpro_content',''),
      is_deleted       = false,
      updated_at       = now(),
      updated_by       = v_actor
      WHERE id = v_song_id;

  ELSE  -- addition
    v_slug := public.gc_next_song_slug(coalesce(v_payload->>'title','untitled'));
    INSERT INTO public.songs(
      title, artist, default_key, tempo, time_signature, country, youtube_id,
      language, pptx_url, tags, chordpro_content, slug, is_deleted, created_by, updated_by
    ) VALUES (
      coalesce(v_payload->>'title','Untitled'),
      v_payload->>'artist',
      v_payload->>'default_key',
      nullif(v_payload->>'tempo','')::int,
      v_payload->>'time_signature',
      v_payload->>'country',
      v_payload->>'youtube_id',
      v_payload->>'language',
      v_payload->>'pptx_url',
      v_tags,
      coalesce(v_payload->>'chordpro_content',''),
      v_slug, false, v_sug.suggested_by, v_actor
    ) RETURNING id INTO v_song_id;
  END IF;

  IF v_sug.personal_song_id IS NOT NULL THEN
    UPDATE public.personal_songs
      SET status='published', published_song_id=v_song_id
      WHERE id = v_sug.personal_song_id;
  END IF;

  UPDATE public.song_suggestions
    SET status='approved', reviewed_by=v_actor, reviewed_at=now()
    WHERE id = p_suggestion_id;

  INSERT INTO public.editor_audit_log(actor_id, action, song_id, song_title, payload_snapshot)
    VALUES (v_actor, 'approved', v_song_id, v_payload->>'title', v_payload);

  RETURN jsonb_build_object('status','approved','song_id',v_song_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.review_song_suggestion(uuid, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.review_song_suggestion(uuid, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.gc_next_song_slug(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.gc_next_song_slug(text) TO authenticated;
