---
name: ui-screen
description: Build or change a page, view or component in Construction Ledger's UI (src/app/**/page.tsx, src/components). Use for any frontend work — new screens, forms, lists, dialogs, styling, responsive or dark-mode fixes.
---

# UI work

Design spec: `docs/12-DESIGN-AUDIT.md` (tokens, layouts, per-screen findings) and `docs/05-FRONTEND-UX.md`.
Primary users are on phones at a construction site — mobile first, big targets, works in sunlight
and dark mode.

## Structure
- `page.tsx` (server, `export const dynamic = 'force-dynamic'`) loads session/membership and renders a
  client `*View.tsx` from `src/components/`. Pass `role` so the view can hide write affordances
  (Add buttons, FABs, ⋯ edit/delete) from viewers — the server still enforces roles.
- Data goes through `api` from `src/lib/api-client.ts`. Creates send an `Idempotency-Key` from
  `newIdempotencyKey()`, generated once per form submission and **reused on retry**.

## Use the primitives (`src/components/ui/`)
`Button` (primary/secondary/ghost/danger, `loading`) · `IconButton` · `Field` + `TextInput`/`DateInput`/
`Textarea`/`Select`/`MoneyInput`/`Segmented` (from `inputs.tsx`; `Field` wires label `for`/`id` and
`aria-describedby`) · `Sheet` (bottom sheet on mobile, drawer on desktop: add/edit forms) ·
`ConfirmDialog` · `useToast()` (supports an `action`, e.g. Undo) · `Alert` · `Skeleton` · `EmptyState` ·
`StatusBadge`/`ProgressBar` · `RowMenu` (⋯ menu, renders fixed) · `Lightbox` · `useFocusTrap`.
Uploads: `UploadPicker`/`useUploads` (presign → XHR PUT with progress → finalize, ≤10 files × 10 MB).
Never use `window.confirm`/`alert`/`prompt`.

## Styling rules
- Semantic tokens only: `bg-bg`, `bg-surface`, `bg-surface-2`, `border-border(-strong)`,
  `text-ink`/`ink-2`/`ink-3`, `bg-primary`/`text-primary-foreground`/`bg-primary-tint`, `ok`/`warn`/`danger`
  (+ `-tint`). Defined in `src/app/globals.css` (light + dark) and mapped in `tailwind.config.ts`.
  No raw Tailwind palette colours (`gray-500`, `blue-600`…) and no hex in components.
- Fonts: `font-display` (Archivo) for headings/numbers, default `font-sans` (IBM Plex Sans).
- Radii `rounded-sm/md/lg/sheet`; shadows `shadow-e1/e2`. Touch targets ≥ 44px (`h-11`).
- Shell: bottom bar < `md` (respect `--bottom-nav-h` / safe-area), 72px rail at `md`, 248px sidebar at
  `lg`, content `max-w-[1200px]`. Lists: cards on mobile, table at `md+`.
- Money via `formatINR`, dates via `formatDate`/`formatDayLabel` (IST) from `src/lib/format.ts`.
- Icons from `lucide-react`; decorative icons get `aria-hidden`.

## Verify
`npm run typecheck && npm run lint && npm run build && npm run test:e2e` (axe + layout checks run on
desktop and Pixel 7). Eyeball it with the `agent-browser` CLI at phone (≈390px) and desktop widths,
light and dark, as an admin and a viewer. Add a Playwright test for any new flow — see the
`e2e-testing` skill.
