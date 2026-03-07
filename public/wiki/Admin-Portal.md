The Admin Portal (`/admin`) is a role-restricted dashboard for managing users and access requests. It requires the **admin** or **owner** role — see [[Roles-and-Access]].

## At a glance
- View and manage all registered users
- Promote or demote user roles (within your own role's limits)
- Delete user accounts (owner only)
- Review and approve/deny collaborator access requests
- Role permission matrix reference

## User Management Table

Displays all users with:
- **Name** — display name set by the user
- **Email** — account email from Supabase Auth
- **Role** — current role shown as a colored pill
- **Account Age** — time since account creation (e.g., "3 months")
- **Actions** — role dropdown + delete button

### Changing a role

Select a new role from the dropdown in the Actions column. Changes take effect immediately.

Promotion limits:
- **Admins** can promote up to **editor** and can promote any user to **collaborator**.
- Only **owners** can promote to **admin** or change an owner's role.
- You cannot change your own role.

### Deleting accounts

The **Delete** button is visible only to owners. A confirmation dialog is shown before deletion. Deleted accounts remove the user from `public.users` (cascades to starred songs and collaborator requests).

## Pending Collaborator Requests

Shows users who have submitted a request for collaborator access from their Profile page. Each entry displays:
- User display name and email
- Request date

**Approve** → sets the user's role to `collaborator`.
**Deny** → marks the request as denied and leaves the user's role unchanged.

## Role Permission Matrix

The portal includes a full role matrix showing which actions each role level can take — the same matrix documented in [[Roles-and-Access]].

## Access

The `/admin` route is wrapped in `<RoleGuard minRole="admin">`. Users without admin or owner role are redirected to `/` with a toast.

[[Roles-and-Access]] [[Editor-Guide]]
