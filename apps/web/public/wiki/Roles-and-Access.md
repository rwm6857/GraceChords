GraceChords uses a four-level role system to control who can view, edit, and manage site content.

## Roles

| Role | Description |
|------|-------------|
| **user** | Default for all signed-in accounts. Can star songs, use personal features, create personal songs, and submit songs for review. |
| **editor** | Can add/edit songs and blog posts directly, approve/reject song suggestions, and request deletions. Access to the Editor Portal (`/editor`). |
| **admin** | Full site management — all editor permissions plus deleting content, promoting users up to editor, and access to the Admin Portal (`/admin`). |
| **owner** | Unrestricted access. Can promote users to admin and delete accounts. There is exactly one owner, and the role cannot be granted through the app — see below. |

## Permission Matrix

| Action | user | editor | admin | owner |
|--------|------|--------|-------|-------|
| View public site | ✓ | ✓ | ✓ | ✓ |
| Star songs / personal features | ✓ | ✓ | ✓ | ✓ |
| Create personal songs & submit for review | ✓ | ✓ | ✓ | ✓ |
| Add/edit songs & posts directly | | ✓ | ✓ | ✓ |
| Approve/reject suggestions | | ✓ | ✓ | ✓ |
| Request deletion | | ✓ | ✓ | ✓ |
| Delete songs & posts | | | ✓ | ✓ |
| Promote users to Editor | | | ✓ | ✓ |
| Promote users to Admin | | | | ✓ |
| Promote anyone to Owner | | | | |
| Delete user accounts | | | | ✓ |
| Access Admin Portal | | | ✓ | ✓ |
| Access Editor Portal | | ✓ | ✓ | ✓ |

Nobody can assign the **owner** role — that row is deliberately empty.
`update_user_role()` accepts only `admin`, `editor` and `user`; asking for `owner`
raises `Invalid role: owner`. The single owner is set by direct SQL against the
database. For the same reason the RPC refuses to change the caller's *own* role,
so an owner cannot accidentally demote themselves into a state no RPC can undo.

## Role Enforcement

Routes `/admin` and `/editor` are protected by `RoleGuard` (`src/components/auth/RoleGuard.jsx`). Users without the required minimum role are redirected to `/` with a toast notification.

The `useAuth` hook (`src/hooks/useAuth.jsx`) exposes:
- `role` — the user's current role string
- `hasMinRole(minRole)` — returns `true` if the user meets or exceeds the minimum role
- `isOwner`, `isAdmin`, `isEditorRole` — convenience booleans

## Role Data

Roles are stored in the `role` column of the `public.users` table in Supabase. The
`ROLE_ORDER` hierarchy used by `hasMinRole` is: `user → editor → admin → owner`. A
value outside that list grants nothing at all — not even user-level access — so an
unrecognised role fails closed.

Roles can only be changed by calling the `update_user_role()` RPC. A `BEFORE UPDATE`
trigger, `guard_users_role_change()`, rejects any other write to the `role` column,
and `authenticated` holds no column-level UPDATE privilege on it. Both controls are
independent of the UI.
