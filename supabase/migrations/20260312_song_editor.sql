-- =============================================================================
-- GraceChords: Song Editor migration (2026-03-12)
-- Rebuilds song_suggestions, drops song_proposals, creates editor_audit_log
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1a. Rebuild song_suggestions
-- ---------------------------------------------------------------------------
drop table if exists song_suggestions cascade;

create table song_suggestions (
  id               uuid        primary key default gen_random_uuid(),
  song_id          uuid        references songs(id) on delete cascade,
  suggested_by     uuid        references public.users(id),
  change_type      text        not null check (change_type in ('addition', 'edit', 'deletion')),
  payload          jsonb       not null,
  status           text        not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  proposer_note    text,
  reviewed_by      uuid        references public.users(id),
  reviewed_at      timestamptz,
  rejection_reason text,
  created_at       timestamptz default now()
);

alter table song_suggestions enable row level security;

-- Collaborator+ can insert
create policy "collab_insert" on song_suggestions
  for insert with check (
    exists (
      select 1 from public.users
      where id = auth.uid()
      and global_role in ('collaborator','editor','admin','owner')
    )
  );

-- Suggester can read their own; Editor+ can read all
create policy "read_suggestions" on song_suggestions
  for select using (
    suggested_by = auth.uid()
    or exists (
      select 1 from public.users
      where id = auth.uid()
      and global_role in ('editor','admin','owner')
    )
  );

-- Editor+ can update status (approve/reject)
create policy "editor_update" on song_suggestions
  for update using (
    exists (
      select 1 from public.users
      where id = auth.uid()
      and global_role in ('editor','admin','owner')
    )
  );


-- ---------------------------------------------------------------------------
-- 1b. Drop song_proposals
-- ---------------------------------------------------------------------------
drop table if exists song_proposals cascade;


-- ---------------------------------------------------------------------------
-- 1c. Create editor_audit_log
-- ---------------------------------------------------------------------------
create table editor_audit_log (
  id               uuid        primary key default gen_random_uuid(),
  actor_id         uuid        references public.users(id) on delete set null,
  action           text        not null check (action in ('direct_save','suggestion_submitted','approved','rejected','deleted','touched_up')),
  song_id          uuid        references songs(id) on delete set null,
  song_slug        text,
  song_title       text,
  payload_snapshot jsonb,
  note             text,
  created_at       timestamptz default now()
);

alter table editor_audit_log enable row level security;

-- Admin+ can read
create policy "admin_read_audit" on editor_audit_log
  for select using (
    exists (
      select 1 from public.users
      where id = auth.uid()
      and global_role in ('admin','owner')
    )
  );

-- Any authenticated user can insert (controlled in app logic)
create policy "auth_insert_audit" on editor_audit_log
  for insert with check (auth.uid() is not null);
