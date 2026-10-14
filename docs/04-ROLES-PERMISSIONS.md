# Roles & Permissions Matrix

Roles are **per-project** (stored in `ProjectMember.role`). A user can be admin on one project and
viewer on another. Every check is server-side and re-reads membership from the database on each request.

| Action | Admin | Editor | Viewer |
|---|---|---|---|
| View transactions, diary, budgets, dashboard | ✅ | ✅ | ✅ |
| Add transaction (with bill photo) | ✅ | ✅ | ❌ |
| Edit **any** transaction | ✅ | ✅ | ❌ |
| Soft-delete transaction | ✅ | ❌ | ❌ |
| Restore soft-deleted transaction | ✅ | ❌ | ❌ |
| Add diary entry (with photos) | ✅ | ✅ | ❌ |
| Edit own diary entry | ✅ | ✅ | ❌ |
| Edit someone else's diary entry | ✅ | ❌ | ❌ |
| Delete diary entry | ✅ | ❌ | ❌ |
| Upload image to own diary/transaction | ✅ | ✅ | ❌ |
| Delete own uploaded image | ✅ | ✅ | ❌ |
| Delete someone else's image | ✅ | ❌ | ❌ |
| Create/edit budgets & revisions | ✅ | ❌ | ❌ |
| View budget revision history | ✅ | ✅ | ✅ |
| Create/edit categories | ✅ | ❌ | ❌ |
| View members | ✅ | ✅ | ✅ |
| Invite/remove members, change roles | ✅ | ❌ | ❌ |
| Edit project settings | ✅ | ❌ | ❌ |

> Editor transaction scope is **any transaction** in the project (aligned with `08` §12), not only
> the editor's own. Diary edits remain author-or-admin.

## Enforcement Rules
1. **Server-side only** — role checks live in Next.js route handlers / proxy middleware, never only in the UI.
2. **Session is Neon Auth** — the session identifies the user; the role is looked up fresh from
   `ProjectMember` on every request. No role is stored in a token.
3. **Helper**: `requireRole(projectId, userId, minRole)` throws 403 if the caller is not a member or
   lacks the minimum role. Viewers are denied POST/PATCH/DELETE even via manual API calls.
4. **Project isolation** — a member of project A cannot read or write project B's transactions,
   diary, budgets, or images. Every query is scoped by `projectId` and membership is verified first.
5. **Membership is rechecked on every request** — a removed member loses access immediately on their
   next call (no long-lived authorization cache).
6. **Audit log** records `actorId` for every mutation, so any abuse/mistake is traceable.
7. **No automatic membership on sign-up** — new accounts belong to no project. Bootstrap the initial
   admin via seed/CLI for a known Neon Auth user id; avoid a public first-sign-up-wins-admin route.
8. **Last admin safeguard** — the final admin of a project cannot be removed or demoted.
9. **Maintenance endpoints are not user-facing** — `/api/maintenance/*` is gated by a shared
   `MAINTENANCE_SECRET`/`CRON_SECRET` and is not part of the per-project role model. It denies with
   401 when no secret is configured and never returns project data to unauthenticated callers.
10. **Invitations** — an admin may invite an email that has no account yet; the pending invitation is
    claimed automatically on that person's first sign-in and the stored role is applied. The project
    creator is its first admin. New sign-ups still receive no membership on their own.

## Acceptance Checks (must hold)
- [ ] Viewer POST/PATCH/DELETE denied even via manual API calls.
- [ ] Project A member cannot access project B transactions/diary/budgets/images.
- [ ] Removed member loses access when membership is rechecked.
- [ ] Last admin cannot be removed/demoted accidentally.
- [ ] New sign-up cannot claim existing project ownership.
- [ ] Every project read/write/attachment URL request checks session **and** current membership.
- [ ] Attachment GET URLs are short-lived and issued only after a membership check.
