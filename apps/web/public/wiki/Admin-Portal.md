The Admin Portal (`/admin`) is a role-restricted dashboard for managing users and roles. It requires the **admin** or **owner** role — see [[Roles-and-Access]].

## At a glance
- View and manage all registered users
- Promote or demote user roles (within your own role's limits)
- Delete user accounts (owner only)
- Download the whole song library as a ZIP of ChordPro files
- Link to **Setlist Stats** (`/admin/stats`)
- Role permission matrix reference

## User Management Table

Displays all users with:
- **Name** — display name set by the user
- **Role** — current role shown as a colored pill
- **Account Age** — time since account creation (e.g., "3 months")
- **Actions** — role dropdown + delete button

Use **Refresh** to reload the list.

### Changing a role

Select a new role from the dropdown in the Actions column. Changes take effect immediately.

Promotion limits:
- **Admins** can promote up to **editor**.
- Only **owners** can promote to **admin**.
- **Nobody** can promote anyone to **owner** — the dropdown does not offer it, and
  `update_user_role()` rejects it. The single owner is set by direct SQL.
- You cannot change your own role. This is enforced by the database, not just the UI.

### Deleting accounts

The **Delete** button is visible only to owners. A confirmation dialog is shown before deletion. Deleting removes the row from `auth.users`, which cascades to `public.users` and everything that references it (starred songs, setlists, reflections).

## Song Library export

**Download all ChordPro** downloads every published song as a ZIP of `slug.pro` ChordPro files, each opening with its `{title: …}` line.

## Role Permission Matrix

The portal includes a summary role matrix showing which actions each role level can take; the full matrix is documented in [[Roles-and-Access]].

## Access

The `/admin` route is wrapped in `<RoleGuard minRole="admin">`. Users without admin or owner role are redirected to `/` with a toast.

[[Roles-and-Access]] [[Admin-Resources]]
