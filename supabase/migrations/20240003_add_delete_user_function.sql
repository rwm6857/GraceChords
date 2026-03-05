-- Function to delete the currently authenticated user and all their data.
-- Uses SECURITY DEFINER so it can delete from auth.users.
-- Cascades handle public.users and user_starred_songs automatically.
create or replace function public.delete_user()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Explicit delete for tables without CASCADE from auth.users
  delete from public.contributor_requests where user_id = auth.uid();

  -- Deleting from auth.users cascades to:
  --   public.users (via FK references auth.users(id) on delete cascade)
  --   public.user_starred_songs (via FK references auth.users(id) on delete cascade)
  delete from auth.users where id = auth.uid();
end;
$$;

-- Restrict execution to authenticated users only
revoke all on function public.delete_user() from public;
grant execute on function public.delete_user() to authenticated;
