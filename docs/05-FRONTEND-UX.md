# Frontend / UX Design

## Pages
| Route | Purpose | Access |
|---|---|---|
| /login | Neon Auth sign-in / sign-up | Public |
| /projects | List my projects | Any logged-in |
| /projects/:id | Dashboard (budget vs actual, recent activity) | viewer |
| /projects/:id/transactions | Transaction list + filters + pagination + add/edit modal | viewer (read) / editor (write) |
| /projects/:id/timeline | Merged transactions + diary feed (date filter, pagination) | viewer |
| /projects/:id/diary | Diary timeline with photo cards | viewer (read) / editor (write) |
| /projects/:id/budgets | Budget management (admin) / view (others) | viewer |
| /projects/:id/more | Mobile menu linking to every section | viewer |
| /projects/:id/members | Member management | admin |
| /projects/:id/settings | Project settings + categories | admin |

> **Status:** `/login`, `/projects`, Dashboard, Transactions, Timeline, Diary, Budgets, More,
> Members and Settings are implemented. Members/Settings are admin-only. On mobile the bottom bar shows
> Dashboard / Transactions / Diary + **More** (which links to Budgets, Members, Settings, Timeline).

## Auth UI
- Sign-in / sign-up is provided by **Neon Auth** (`@neondatabase/auth` client through the same-origin
  `/api/auth` proxy). No custom password forms or storage.
- **Google**: a "Continue with Google" button calls `signIn.social({ provider: 'google', callbackURL })`.
  Enabled on the branch with **shared keys** (dev). Production needs your own Google OAuth app and the
  app origin in the provider's authorized redirect URIs + Neon Auth trusted origins.
- **Magic link**: the login page offers "Email me a magic link" (`signIn.magicLink({ email, callbackURL })`).
  Requires the magic-link plugin to be **enabled on the Neon Auth branch**; until then the endpoint
  returns 404 and the UI surfaces the error.
- Handle loading, error, and **email-verification** states (code-based; the shared SMTP provider is
  used in development). Show clear messages on invalid credentials and unverified accounts.
- Sign-out clears the session and returns to `/login`.

## Design system
- **Tokens** live in `globals.css` (semantic `--bg/--surface/--border/--ink/--primary/--ok/--warn/--danger`
  + dark-mode values) and are mapped in `tailwind.config.ts` (`bg-bg`, `text-ink-2`, `bg-primary-tint`,
  `border-border`, …). Prefer these over raw `slate-*`/`white` when adding UI.
- **Type**: Archivo (`font-display`) for headings, IBM Plex Sans (`font-body`) for UI, loaded via `next/font`.
- **Focus**: a global `:focus-visible` ring is defined; do not use `outline-none`.
- **Formatters**: `src/lib/format.ts` — `formatINR` (with `compact`) and `formatDate`/`formatDayLabel`
  in `Asia/Kolkata`. Use `tabular-nums` for money columns.
- **Nav**: `NavLink` renders active state + `aria-current`, with `lucide-react` icons; desktop sidebar
  and a mobile bottom bar (Dashboard / Expenses / Diary / More) that respects the safe-area inset.
- **Primitives** (`src/components/ui/`): `Button`, `IconButton`, `Field` + `TextInput`/`DateInput`/`Textarea`/
  `Select`/`MoneyInput`/`Segmented`, `Sheet` (bottom sheet on mobile / right drawer at md+), `ConfirmDialog`,
  `Toast` (`useToast`, aria-live), `Alert`, `Skeleton`, `StatusBadge`, `ProgressBar`, `EmptyState`, `Lightbox`.

## Key UI Patterns
- **Mobile-first**: bottom tab bar on mobile (Dashboard / Transactions / Diary / More), sidebar on desktop.
- **Transaction form**: bottom-sheet modal on mobile, side drawer on desktop. Fields: date, category
  (select), amount, GST, vendor, payment mode, description, photo upload (camera capture on mobile
  via `<input type="file" accept="image/*" capture="environment">`).
- **Upload UX (direct-to-R2)**: on save, presign → PUT to R2 → finalize → link. Show a per-file
  progress/pending state; retry on failure. Accepted: images (jpeg/png/webp/gif) and files
  (pdf/txt/csv/xls/xlsx); heic/heif accepted but download-only. Up to **10 files per record, 10 MB
  each**. Images show as thumbnails (tap → lightbox); non-images render as download chips. Unsupported
  types are rejected with a clear message, not silently dropped.
- **Safety**: only images are ever rendered inline. Documents are served as forced downloads
  (`attachment`, `octet-stream`, `nosniff`) — the app never renders or executes uploaded files.
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
- **Transactions**: a **Sheet** (bottom sheet on mobile / right drawer on desktop) for add/edit with a
  large `MoneyInput`, category, date, GST, payment mode (`Segmented`), vendor and notes; **Camera/Upload**
  buttons; a mobile **FAB**; a filter Sheet with removable chips; list grouped by day with daily totals;
  row actions in an overflow menu; `ConfirmDialog` for deletes; toasts on save/delete. Amounts use
  `formatINR` + tabular numerals.
- **Diary**: author/admin edit inline (add/remove photos on edit); admin delete. Photos open in the
  same lightbox.
- **Timeline**: transactions and diary merged chronologically, with a date filter and pagination.
- **Empty states**: friendly prompts ("No transactions yet — add your first expense").

## PWA
- `manifest.json` with app name, icons, theme color.
- Custom service worker (no `next-pwa`): cache the app shell for faster loads; **API requests are
  network-first and never cached publicly** (private data). No offline write queue in v1.
- Install prompt on mobile (A2HS).
- **Status:** manifest + service worker (`public/sw.js`) implemented; registered in production via
  `ServiceWorkerRegister`. API responses are never cached.

## Design Tokens
- Primary color: `#2563eb` (blue) or user's choice.
- Font: Inter or system-ui.
- Spacing: 4px grid.
- Cards: rounded-xl, subtle shadow, white bg.

## Hosting
- Served from **Vercel** as a Next.js app; public hostname `https://build.harishspace.in` via
  Cloudflare DNS. PWA is installable over HTTPS.
