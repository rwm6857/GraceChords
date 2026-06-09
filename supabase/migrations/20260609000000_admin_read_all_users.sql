-- =============================================================================
-- GraceChords: Allow admins/owners to read all users (Admin Portal fix)
--
-- Symptom: the Admin Portal showed "No users found" for admins and owners.
-- The base SELECT policy on public.users (created in the dashboard) only
-- exposes the caller's own row (id = auth.uid()), which is correct for the
-- profile page but hides every other account from admin tooling.
--
-- Fix: ADD a permissive SELECT policy so anyone at admin rank or above can
-- read all rows. RLS permissive policies are OR'd together, so the existing
-- self-read policy is left untouched — regular users still see only their own
-- profile, and the profile page keeps working.
--
-- Safety: public.has_min_role() is SECURITY DEFINER and reads public.users with
-- the definer's privileges, so referencing it in a policy on public.users does
-- NOT cause RLS recursion.
-- =============================================================================

alter table public.users enable row level security;

drop policy if exists "Admins can view all users" on public.users;

create policy "Admins can view all users"
  on public.users for select
  using (public.has_min_role('admin'));
