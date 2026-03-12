-- Posts table for the blog/news system
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  excerpt text,
  content text,           -- Tiptap HTML output
  featured_image_url text,
  tags text[] default '{}',
  status text not null default 'draft' check (status in ('draft', 'published')),
  author_id uuid references public.users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists posts_slug_idx on public.posts(slug);
create index if not exists posts_status_idx on public.posts(status);
create index if not exists posts_author_idx on public.posts(author_id);
create index if not exists posts_published_at_idx on public.posts(published_at desc);

-- Updated_at trigger
create or replace function public.set_posts_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists posts_updated_at on public.posts;
create trigger posts_updated_at
  before update on public.posts
  for each row execute function public.set_posts_updated_at();

-- RLS
alter table public.posts enable row level security;

-- Public can read published posts
create policy "posts_public_read"
  on public.posts for select
  using (status = 'published');

-- Authenticated users with editor+ role can read all posts (drafts too)
create policy "posts_editor_read_all"
  on public.posts for select
  to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.role in ('editor', 'admin', 'owner')
    )
  );

-- Authenticated editors+ can insert
create policy "posts_editor_insert"
  on public.posts for insert
  to authenticated
  with check (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.role in ('editor', 'admin', 'owner')
    )
  );

-- Authenticated editors+ can update
create policy "posts_editor_update"
  on public.posts for update
  to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.role in ('editor', 'admin', 'owner')
    )
  );

-- Admins+ can delete
create policy "posts_admin_delete"
  on public.posts for delete
  to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.role in ('admin', 'owner')
    )
  );
