GraceChords uses a five-level role system to control who can view, edit, and manage site content.

## Roles

| Role | Description |
|------|-------------|
| **user** | Default for all signed-in accounts. Can star songs and use personal features. |
| **collaborator** | Trusted community contributor. Can suggest song edits/additions. Requires 7-day-old account + admin approval. |
| **editor** | Can add/edit songs and blog posts directly, approve/reject collaborator suggestions, and request deletions. Access to the Editor Portal (`/editor`). |
| **admin** | Full site management — all editor permissions plus deleting content, promoting users up to editor, and access to the Admin Portal (`/admin`). |
| **owner** | Unrestricted access. Can promote users to admin, delete accounts, and change any role. |

## Permission Matrix

| Action | user | collab | editor | admin | owner |
|--------|------|--------|--------|-------|-------|
| View public site | ✓ | ✓ | ✓ | ✓ | ✓ |
| Star songs / personal features | ✓ | ✓ | ✓ | ✓ | ✓ |
| Suggest song edits/additions | | ✓ | ✓ | ✓ | ✓ |
| Add/edit songs & posts directly | | | ✓ | ✓ | ✓ |
| Approve/reject suggestions | | | ✓ | ✓ | ✓ |
| Request deletion | | | ✓ | ✓ | ✓ |
| Delete songs & posts | | | | ✓ | ✓ |
| Promote users to Collaborator | | | | ✓ | ✓ |
| Promote Collaborators to Editor | | | | ✓ | ✓ |
| Promote users to Admin | | | | | ✓ |
| Delete user accounts | | | | | ✓ |
| Access Admin Portal | | | | ✓ | ✓ |
| Access Editor Portal | | | ✓ | ✓ | ✓ |

## Role Enforcement

Routes `/admin` and `/editor` are protected by `RoleGuard` (`src/components/auth/RoleGuard.jsx`). Users without the required minimum role are redirected to `/` with a toast notification.

The `useAuth` hook (`src/hooks/useAuth.jsx`) exposes:
- `role` — the user's current role string
- `hasMinRole(minRole)` — returns `true` if the user meets or exceeds the minimum role
- `isOwner`, `isAdmin`, `isEditorRole`, `isCollaborator` — convenience booleans

## Requesting Collaborator Access

Regular users with accounts at least 7 days old can request collaborator access from their Profile page (`/profile`). The `CollaboratorRequest` component (`src/components/CollaboratorRequest.jsx`) handles eligibility checks and submission. Requests land in the Admin Portal for review.

- Accounts under 7 days see an "eligible after" date instead of the request button.
- Only one pending request is allowed per user.
- Admins approve or deny requests from the [[Admin-Portal]].

## Role Data

Roles are stored in the `role` column of the `public.users` table in Supabase. Row Level Security policies enforce that only admins/owners can modify roles. The `ROLE_ORDER` hierarchy used by `hasMinRole` is: `user → collaborator → editor → admin → owner`.

[[Admin-Portal]] [[Getting-Started]]
