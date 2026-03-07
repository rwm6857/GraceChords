Song authoring and site management are split across two role-gated portals:

| Portal | Route | Required Role | Purpose |
|--------|-------|---------------|---------|
| **Editor Portal** | `/editor` | editor or above | Draft and publish songs/posts |
| **Admin Portal** | `/admin` | admin or owner | User and role management |

Both routes are protected by `RoleGuard`. Users without the minimum role are redirected to `/` with a toast notification.

## Editor Portal (`/editor`)

The Editor Portal is the entry point for editors. It links to songs and resources for direct editing. See [[Admin-Tips]] for the detailed authoring workflow (loading songs, staging, publishing PRs, and ChordPro shortcuts).

Editors can:
- Add/edit songs and blog posts directly
- Approve or reject collaborator suggestions
- Request deletions

## Admin Portal (`/admin`)

The Admin Portal is for **admin** and **owner** users. See [[Admin-Portal]] for the full reference.

Admins can:
- View all registered users with roles and account ages
- Promote or demote roles (within allowed bounds)
- Approve/deny collaborator access requests
- (Owner only) Delete user accounts

## Role system

GraceChords uses five roles: `user → collaborator → editor → admin → owner`. See [[Roles-and-Access]] for the full permission matrix and how to request collaborator access.

[[Admin-Portal]] [[Admin-Tips]] [[Roles-and-Access]] [[ChordPro-Guide]]
