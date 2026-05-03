-- =============================================================================
-- GraceChords: Security hardening — add SET search_path = '' to all public
-- schema functions flagged by Supabase Advisor lint 0011.
--
-- All bodies are verified against the live Supabase Dashboard definitions.
--
-- Corrections applied on top of the verified definitions:
--   • current_user_global_role — DROPPED (no callers in src/; global_role
--     enum may no longer exist after profiles/enum cleanup).
--   • claim_contributor_invite — `current_role global_role` → `current_role
--     text`; `set global_role = 'contributor'` → `set role = 'collaborator'`.
--   • review_contributor_request — same global_role → role fix.
--   • is_global_admin / is_global_editor — rewritten to call get_user_role()
--     instead of the dropped current_user_global_role().
--
-- WARNING: claim_contributor_invite and review_contributor_request reference
-- the `contributor_invites`, `contributor_requests`, and `song_proposals`
-- tables plus the `request_status` / `proposal_status` custom types.
-- Confirm these objects still exist in the DB before pushing.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. update_updated_at
--    Source: supabase/migrations/20260312_posts.sql (verified)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ---------------------------------------------------------------------------
-- 2. update_song_star_count
--    Source: supabase/migrations/20260305_songs_migration.sql (verified)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_song_star_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.songs SET star_count = star_count + 1 WHERE id = NEW.song_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.songs SET star_count = greatest(star_count - 1, 0) WHERE id = OLD.song_id;
  END IF;
  RETURN NULL;
END;
$$;


-- ---------------------------------------------------------------------------
-- 3. set_updated_at (verified — no SECURITY DEFINER)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;


-- ---------------------------------------------------------------------------
-- 4. get_user_role (verified — LANGUAGE sql STABLE)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT role FROM public.users WHERE id = auth.uid();
$function$;


-- ---------------------------------------------------------------------------
-- 5. has_min_role (verified — LANGUAGE sql STABLE)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_min_role(min_role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT CASE public.get_user_role()
    WHEN 'owner'        THEN true
    WHEN 'admin'        THEN min_role IN ('admin','editor','collaborator','user')
    WHEN 'editor'       THEN min_role IN ('editor','collaborator','user')
    WHEN 'collaborator' THEN min_role IN ('collaborator','user')
    WHEN 'user'         THEN min_role = 'user'
    ELSE false
  END;
$function$;


-- ---------------------------------------------------------------------------
-- 6. current_user_global_role — DROPPED
--    No callers exist in src/; the global_role enum may have been removed
--    during the profiles/enum cleanup.  Drop it to clear the Advisor flag.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.current_user_global_role();


-- ---------------------------------------------------------------------------
-- 7. is_global_editor
--    Verified body rewritten: calls get_user_role() instead of the dropped
--    current_user_global_role().
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_global_editor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT public.get_user_role() IN ('admin', 'editor');
$function$;


-- ---------------------------------------------------------------------------
-- 8. is_global_admin
--    Verified body rewritten: calls get_user_role() instead of the dropped
--    current_user_global_role().
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_global_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT public.get_user_role() = 'admin';
$function$;


-- ---------------------------------------------------------------------------
-- 9. is_collaborator_eligible (verified — LANGUAGE sql STABLE)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_collaborator_eligible()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT (now() - account_created_at) >= interval '7 days'
  FROM public.users
  WHERE id = auth.uid();
$function$;


-- ---------------------------------------------------------------------------
-- 10. get_set_limit (verified — LANGUAGE sql IMMUTABLE, takes p_role text)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_set_limit(p_role text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT CASE p_role
    WHEN 'owner'        THEN NULL
    WHEN 'admin'        THEN 30
    WHEN 'editor'       THEN 30
    WHEN 'collaborator' THEN 25
    WHEN 'user'         THEN 10
    ELSE 10
  END;
$function$;


-- ---------------------------------------------------------------------------
-- 11. enforce_set_limit (verified — calls get_set_limit(user_role_val))
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_set_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  user_role_val text;
  set_limit     int;
  current_count int;
BEGIN
  SELECT role INTO user_role_val FROM public.users WHERE id = NEW.user_id;
  set_limit := get_set_limit(user_role_val);
  IF set_limit IS NULL THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO current_count FROM public.saved_sets WHERE user_id = NEW.user_id;
  IF current_count >= set_limit THEN
    RAISE EXCEPTION 'SET_LIMIT_REACHED: % sets allowed for role %', set_limit, user_role_val;
  END IF;
  RETURN NEW;
END;
$function$;


-- ---------------------------------------------------------------------------
-- 12. update_user_role (verified)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_user_role(target_user_id uuid, new_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  caller_role         text := public.get_user_role();
  target_current_role text;
BEGIN
  IF new_role NOT IN ('owner','admin','editor','collaborator','user') THEN
    RAISE EXCEPTION 'Invalid role: %', new_role;
  END IF;

  SELECT role INTO target_current_role
  FROM public.users WHERE id = target_user_id;

  IF new_role IN ('owner','admin') AND caller_role != 'owner' THEN
    RAISE EXCEPTION 'Insufficient privileges to assign role: %', new_role;
  END IF;

  IF caller_role = 'admin' AND new_role NOT IN ('editor','collaborator','user') THEN
    RAISE EXCEPTION 'Admins can only assign editor, collaborator, or user roles';
  END IF;

  IF target_current_role = 'owner' AND caller_role != 'owner' THEN
    RAISE EXCEPTION 'Cannot modify an owner account';
  END IF;

  UPDATE public.users SET role = new_role WHERE id = target_user_id;
END;
$function$;


-- ---------------------------------------------------------------------------
-- 13. claim_contributor_invite (verified, with corrections)
--    • `current_role global_role` → `current_role text`
--    • `set global_role = 'contributor'` → `set role = 'collaborator'`
--    WARNING: references contributor_invites table — confirm it exists.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_contributor_invite(invite_token text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
declare
  invite contributor_invites%rowtype;
  current_role text;
begin
  select * into invite
  from contributor_invites
  where token = invite_token;

  if not found then
    return 'invalid_token';
  end if;

  if invite.claimed_by is not null then
    return 'already_claimed';
  end if;

  if invite.expires_at is not null and invite.expires_at < now() then
    return 'expired';
  end if;

  select role into current_role
  from public.users
  where id = auth.uid();

  if current_role is not null then
    return 'already_contributor';
  end if;

  update contributor_invites
  set claimed_by = auth.uid(),
      claimed_at = now()
  where id = invite.id;

  update public.users
  set role = 'collaborator'
  where id = auth.uid();

  return 'claimed';
end;
$function$;


-- ---------------------------------------------------------------------------
-- 14. review_contributor_request (verified, with corrections)
--    • `set global_role = 'contributor'` → `set role = 'collaborator'`
--    WARNING: references contributor_requests table and request_status type.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_contributor_request(request_id uuid, decision request_status, reason text DEFAULT NULL::text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
declare
  req contributor_requests%rowtype;
begin
  if not public.is_global_admin() then
    return 'unauthorized';
  end if;

  select * into req
  from contributor_requests
  where id = request_id;

  if not found then
    return 'not_found';
  end if;

  if req.status <> 'pending' then
    return 'already_reviewed';
  end if;

  update contributor_requests
  set status           = decision,
      reviewed_by      = auth.uid(),
      reviewed_at      = now(),
      rejection_reason = reason
  where id = request_id;

  if decision = 'approved' then
    update public.users
    set role = 'collaborator'
    where id = req.user_id;
  end if;

  return 'done';
end;
$function$;


-- ---------------------------------------------------------------------------
-- 15. review_song_proposal (verified)
--    WARNING: references song_proposals table and proposal_status type.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_song_proposal(proposal_id uuid, decision proposal_status, reason text DEFAULT NULL::text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
declare
  prop song_proposals%rowtype;
begin
  if not public.is_global_editor() then
    return 'unauthorized';
  end if;

  select * into prop
  from song_proposals
  where id = proposal_id;

  if not found then
    return 'not_found';
  end if;

  if prop.status <> 'pending' then
    return 'already_reviewed';
  end if;

  update song_proposals
  set status           = decision,
      reviewed_by      = auth.uid(),
      reviewed_at      = now(),
      rejection_reason = reason
  where id = proposal_id;

  if decision = 'approved' then
    case prop.type

      when 'add' then
        insert into songs (
          title, artist, default_key, tempo, time_signature,
          chordpro_content, created_by, updated_by
        ) values (
          prop.proposed_title,
          prop.proposed_artist,
          prop.proposed_default_key,
          prop.proposed_tempo,
          prop.proposed_time_signature,
          prop.proposed_chordpro_content,
          prop.proposed_by,
          auth.uid()
        );

      when 'update' then
        update songs set
          title            = coalesce(prop.proposed_title,            title),
          artist           = coalesce(prop.proposed_artist,           artist),
          default_key      = coalesce(prop.proposed_default_key,      default_key),
          tempo            = coalesce(prop.proposed_tempo,            tempo),
          time_signature   = coalesce(prop.proposed_time_signature,   time_signature),
          chordpro_content = coalesce(prop.proposed_chordpro_content, chordpro_content),
          updated_by       = auth.uid(),
          updated_at       = now()
        where id = prop.song_id;

      when 'delete' then
        update songs
        set is_deleted = true,
            updated_by = auth.uid(),
            updated_at = now()
        where id = prop.song_id;

    end case;
  end if;

  return 'done';
end;
$function$;
