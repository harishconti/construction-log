# Frontend / UX Design

## Pages
| Route | Purpose | Access |
|---|---|---|
| /login | Neon Auth sign-in / sign-up | Public |
| /projects | List my projects | Any logged-in |
| /projects/:id | Dashboard (budget vs actual, recent activity) | viewer |
| /projects/:id/transactions | Transaction list + filters + add/edit modal | viewer (read) / editor (write) |
| /projects/:id/diary | Diary timeline with photo cards | viewer (read) / editor (write) |
| /projects/:id/budgets | Budget management (admin) / view (others) | viewer |
| /projects/:id/members | Member management | admin |
| /projects/:id/settings | Project settings + categories | admin |

## Auth UI
- Sign-in / sign-up is provided by **Neon Auth** (`@neondatabase/auth` client through the same-origin
  `/api/auth` proxy). No custom password forms or storage.
- Handle loading, error, and **email-verification** states (code-based; the shared SMTP provider is
  used in development). Show clear messages on invalid credentials and unverified accounts.
- Sign-out clears the session and returns to `/login`.

## Key UI Patterns
- **Mobile-first**: bottom tab bar on mobile (Dashboard / Transactions / Diary / More), sidebar on desktop.
- **Transaction form**: bottom-sheet modal on mobile, side drawer on desktop. Fields: date, category
  (select), amount, GST, vendor, payment mode, description, photo upload (camera capture on mobile
  via `<input type="file" accept="image/*" capture="environment">`).
- **Upload UX (direct-to-R2)**: on save, presign → PUT to R2 → finalize → link. Show a per-file
  progress/pending state; retry on failure. Accepted: JPEG/PNG/WebP, up to 10 files per record, 10 MB
  each. Show a clear **unsupported-HEIC** message (do not silently drop).
- **Diary timeline**: vertical timeline; each entry = card with date, title, body, horizontal-scroll
  photo gallery; tap photo → full-screen lightbox.
- **Budget view**: toggle Week/Month; table with columns Category | Planned | Actual | Variance |
  % Used; color-coded (green <80%, yellow 80–100%, red >100%). Week/Month views are **never** summed
  together.
- **Dashboard**: summary cards (Total Spend, This Month, Budget Used %) + Recharts bar chart (planned
  vs actual by category) + recent 5 transactions + recent 3 diary entries.
- **Dates/money**: display in `Asia/Kolkata`; weeks start **Monday**. Amounts are GST-inclusive; show
  GST as an included component, never added on top.
- **Offline**: forms clearly show **unsaved** state; there is no offline write sync in v1. Do not
  imply queued writes.
- **Empty states**: friendly prompts ("No transactions yet — add your first expense").

## PWA
- `manifest.json` with app name, icons, theme color.
- Custom service worker (no `next-pwa`): cache the app shell for faster loads; **API requests are
  network-first and never cached publicly** (private data). No offline write queue in v1.
- Install prompt on mobile (A2HS).

## Design Tokens
- Primary color: `#2563eb` (blue) or user's choice.
- Font: Inter or system-ui.
- Spacing: 4px grid.
- Cards: rounded-xl, subtle shadow, white bg.

## Hosting
- Served from **Vercel** as a Next.js app; public hostname `https://build.harishspace.in` via
  Cloudflare DNS. PWA is installable over HTTPS.
