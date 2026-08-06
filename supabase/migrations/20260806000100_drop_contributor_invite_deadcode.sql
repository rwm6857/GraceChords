-- =============================================================================
-- GraceChords: drop the dead contributor-invite machinery (2026-08-06)
--
-- claim_contributor_invite(text) raises on every possible call:
--
--   * it declares `current_role global_role` and reads/writes a `global_role`
--     column on public.users that no longer exists — 42703 on the first SELECT
--   * it references `contributor_invites` unqualified under search_path = ''
--   * it would set role = 'contributor', a value users_role_check never allowed
--
-- It is nonetheless SECURITY DEFINER with EXECUTE granted to `authenticated`.
-- Nothing in web, mobile, studio, core or workers calls it, and no invite/claim
-- route exists in either router (apps/web/src/App.jsx:45-80 enumerates every web
-- route; apps/mobile/src/lib/deepLinks.ts claims only /song, /songs, /set/:code,
-- /setlist, /worship, /s/:code — the only "code" in a deep link is a setlist
-- share code).
--
-- Live prod holds the ORIGINAL body, not the corrected one at
-- 20260313_fix_function_search_paths.sql:249-300. That is direct evidence that
-- statement 13 of that migration never ran, while 20260522000000:39's
-- ALTER FUNCTION ... SET search_path did — the live function has search_path = ''
-- around a pre-20260313 body. The same holds for review_contributor_request and
-- review_song_proposal, which are left alone here (see the note at the bottom).
--
-- THIS IS NOT ONLY HYGIENE.
--
-- contributor_invites has RLS enabled with a policy "Anyone can read an invite by
-- token" whose qual is literally `true`, on cmd SELECT, targeting {public} — and
-- anon holds the SELECT grant. Any unauthenticated caller can therefore
-- GET /rest/v1/contributor_invites and read every row, including `token` (the
-- invite secret itself) and `invited_email`. The table is empty, so nothing is
-- exposed today, but the surface is live and discoverable in the PostgREST schema
-- cache: a single INSERT would publish that row to the internet. Dropping the
-- table closes it permanently.
--
-- That is why this runs second, immediately after codification and ahead of the
-- policy consolidation, despite being pure removal.
--
-- The table appears in no migration, has zero inbound foreign keys, and holds
-- zero rows — all three verified against prod. Forward-only + idempotent.
-- Paired down migration restores everything, including the exposure. Read its
-- header before running it.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Pre-flight — refuse rather than destroy data.
--
-- The row count was 0 at the time this migration was written. Re-checking at
-- apply time costs nothing and turns a silent data loss into a clean abort.
-- ---------------------------------------------------------------------------
DO $$
DECLARE n bigint;
BEGIN
  IF to_regclass('public.contributor_invites') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.contributor_invites' INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'refusing: contributor_invites has % row(s) — investigate before dropping', n;
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. The function first.
--
-- It is the only object that references the table, so dropping it first means
-- section 2 needs no CASCADE.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.claim_contributor_invite(text);

-- ---------------------------------------------------------------------------
-- 2. The table, with its policies and grants.
--
-- No CASCADE. With zero inbound foreign keys a plain DROP must succeed; if it
-- does not, something references this table that the call-site audit missed, and
-- this migration should fail loudly rather than quietly take that object with it.
--
-- The table's own outbound FKs (invited_by, claimed_by → public.users(id), both
-- ON DELETE NO ACTION) and its two policies go with it automatically. Note that
-- those FKs were a latent hazard: had the table ever held rows, deleting a user
-- named in either column would have made admin_delete_user() fail, because the
-- cascade from auth.users would have hit a non-cascading FK. Dropping the table
-- removes that too.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.contributor_invites;

-- =============================================================================
-- DELIBERATELY LEFT IN PLACE — flagged for a separate decision, not an oversight
--
--   public.review_contributor_request(uuid, request_status, text)
--   public.review_song_proposal(uuid, proposal_status, text)
--   types public.global_role, public.request_status, public.proposal_status
--
-- The two functions are as dead as the one dropped above: they reference
-- contributor_requests and song_proposals, neither of which exists, and both
-- still carry their pre-20260313 bodies writing `global_role`. They are
-- SECURITY DEFINER and they write public.users; they fail today only because the
-- column they target does not exist, which is luck rather than a control. Check
-- whether `authenticated` holds EXECUTE on them:
--
--   SELECT p.proname, p.proacl FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND p.proname IN ('review_contributor_request','review_song_proposal');
--
-- public.global_role is load-bearing for THIS migration's down file: the restored
-- claim_contributor_invite() declares a variable of that type and will not
-- compile without it. Dropping the type here would make this migration
-- irreversible, so it stays. Remove it only together with the two functions
-- above, as a deliberate one-way cleanup with its own migration.
-- =============================================================================
