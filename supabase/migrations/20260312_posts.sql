-- Posts table (already applied manually; kept here for reference/reproducibility)
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  excerpt text,
  content text not null default '',
  featured_image_url text,
  author_id uuid references public.users(id) on delete set null,
  status text not null default 'draft',
  published_at timestamptz,
  tags text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index if not exists posts_slug_idx on public.posts(slug);
create index if not exists posts_status_idx on public.posts(status);
create index if not exists posts_author_idx on public.posts(author_id);
create index if not exists posts_published_at_idx on public.posts(published_at desc);

-- RLS
alter table public.posts enable row level security;

-- Anyone can read published posts
create policy "Public can read published posts"
  on posts for select
  using (status = 'published');

-- Editors and above can read all posts (including drafts)
-- NOTE: uses `role` column on public.users (NOT global_role)
create policy "Editors can read all posts"
  on posts for select
  using (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('editor', 'admin', 'owner')
    )
  );

-- Editors and above can insert
create policy "Editors can insert posts"
  on posts for insert
  with check (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('editor', 'admin', 'owner')
    )
  );

-- Editors and above can update
create policy "Editors can update posts"
  on posts for update
  using (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('editor', 'admin', 'owner')
    )
  );

-- Only admins/owners can delete
create policy "Admins can delete posts"
  on posts for delete
  using (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('admin', 'owner')
    )
  );

-- updated_at trigger
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists posts_updated_at on public.posts;
create trigger posts_updated_at
  before update on public.posts
  for each row execute function public.update_updated_at();
