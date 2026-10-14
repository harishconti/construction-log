# Design Audit: UI, Styles and Responsive Layout

Date: 14 October 2026 · Scope: `src/app/**` pages, `src/components/**`, `globals.css`,
`tailwind.config.ts`, `public/manifest.json`. This document covers visual design, UX, accessibility and
mobile/desktop layout only. Backend issues are in [11-AUDIT.md](11-AUDIT.md).

Visual companion (style sheet plus mobile and desktop mockups): the "Construction Log Design Audit"
canvas on claude.ai.

Severity: **High** blocks usability or accessibility, so fix first · **Medium** clear UX debt ·
**Low** polish.

---

## 1. Summary

The app works, but it uses Tailwind defaults with no design system behind them. The colour palette is a
single `primary` plus `slate-*` utilities hard-coded in every file. There is no type scale, no
navigation active state, and the form pattern does not match the spec in `05-FRONTEND-UX.md` (bottom
sheet on mobile, drawer on desktop). Touch targets and input sizes are tuned for a mouse, so the app
feels cramped on a phone, which is where most site entries happen.

| # | Sev | Area | Finding |
|---|-----|------|---------|
| 1 | High | Navigation | No active state in the sidebar or bottom bar, and no `aria-current` |
| 2 | High | Touch targets | Row actions, the attachment remove chip, pagination and budget arrows are under 44 px |
| 3 | High | Mobile forms | 14 px inputs trigger iOS zoom on focus; amounts lack `inputMode` |
| 4 | High | Form pattern | Add and edit forms open inline instead of in a bottom sheet or drawer |
| 5 | High | Focus | `outline-none` removes the focus indicator; there is no global focus-visible style |
| 6 | High | Labels | Filter inputs use placeholders only; login labels are not linked to their inputs |
| 7 | High | Contrast | `text-slate-400`, `opacity-60` rows and the chart's light-blue bar fail WCAG AA |
| 8 | High | Dialogs | `window.confirm` / `window.prompt` are used for delete and budget revision |
| 9 | Medium | Breakpoints | The sidebar appears at 640 px; content has no max width on wide screens |
| 10 | Medium | Bottom bar | Text-only tabs, 12 px labels, no icons, no safe-area inset |
| 11 | Medium | Primary action | The Add button is top-right and toggles to "Close"; there is no FAB on mobile |
| 12 | Medium | Money | Currency formatting is inconsistent and digits are not tabular |
| 13 | Medium | Dates | `toLocaleDateString()` ignores the IST spec; lists are not grouped by day |
| 14 | Medium | Status colour | Budget state is shown by red, amber or green text alone |
| 15 | Medium | Budgets table | The 6-column table scrolls sideways on phones |
| 16 | Medium | Filters | On mobile, five stacked filter fields push the data below the fold |
| 17 | Medium | Feedback | Plain "Loading…" text, no retry on errors, no save confirmation or undo |
| 18 | Medium | Dashboard | Stat cards lack context; chart axis shows raw numbers; labels collide on mobile |
| 19 | Medium | Typography | No type scale; page titles look like section headers |
| 20 | Medium | Colour tokens | No semantic tokens and no dark mode |
| 21 | Medium | Lightbox | No focus trap, small close button, no swipe, empty `alt` |
| 22 | Low | Timeline | An emoji marks diary items; types are hard to tell apart |
| 23 | Low | Copy | Raw enum values ("upi", "(material)") and developer copy on login |
| 24 | Low | Empty states | Text only, with no action |
| 25 | Low | Login | Mode toggle lacks tab semantics; three auth methods compete for attention |
| 26 | Low | Uploads | Native file input with no preview or per-file progress |
| 27 | Low | Project list | Cards show only the name and role |
| 28 | Low | PWA | SVG-only icon, no apple-touch-icon, theme colour not per scheme |

---

## 2. Findings in detail

### High

**1. Navigation has no active state.** `src/app/projects/[id]/layout.tsx` renders sidebar and
bottom-bar links with the same style, so users cannot tell where they are.
*Fix:* add a client `NavLink` that uses `usePathname()`. The active item gets `--primary-tint`
background, `--primary` text, weight 600 and `aria-current="page"`. Match the Dashboard route exactly
(`/projects/:id`) and other sections by prefix.

**2. Touch targets are too small.** These controls are below the 44×44 px minimum:
- Edit, Delete and Restore text links in `TransactionsView` and `DiaryView` (~20 px tall)
- `DeleteChip` in `AttachmentList` (20×20 px)
- Pagination buttons (`py-1`) and the budget period arrows (`px-2 py-1`)
- The bottom bar (`py-3 text-xs`, ~40 px)

*Fix:* give all interactive elements `min-h-11 min-w-11`. On mobile, move row actions into an overflow
(⋯) menu or a long-press action sheet. Grow the delete chip to 32 px visible inside a 44 px hit area.

**3. Mobile inputs zoom and use the wrong keyboard.** Every input uses `text-sm` (14 px), so iOS Safari
zooms the page on focus. Amount and GST use `type="number"` without `inputMode`.
*Fix:* use `text-base` (16 px) below `md` and `md:text-sm` above. For money, use `inputMode="decimal"`
with a text input and parse the value yourself. Also add `enterKeyHint="next"` / `"done"` and
`autoComplete` on the email and name fields.

**4. The form pattern does not match the spec.** "Add" expands a form above the list, and "Edit"
replaces the row in place, which moves the page and loses scroll position.
*Fix:* build one `Sheet` component. Below `md` it is a bottom sheet (24 px top radius, grab handle,
sticky footer with Cancel and Save, `padding-bottom: env(safe-area-inset-bottom)`). At `md` and above
it is a 440 px right drawer. Use it for transactions, diary entries and budget revisions.

**5. Focus is invisible or inconsistent.** `login/page.tsx` and `NewProjectForm.tsx` use
`outline-none focus:border-primary`. Other controls rely on browser defaults.
*Fix:* add a global rule in `globals.css`:

```css
:where(a, button, input, select, textarea, [tabindex]):focus-visible {
  outline: 3px solid var(--focus);
  outline-offset: 2px;
}
```

Remove every `outline-none`.

**6. Fields are missing labels.** The transaction filters use placeholders only, and the two date
inputs have no label at all. On the login page, `<label>` elements are siblings of the inputs with no
`htmlFor`/`id`, so tapping a label does nothing and screen readers announce nothing.
*Fix:* wrap each input in its label, or pair them with `htmlFor`/`id`. In compact filter bars, use
visible small labels ("From", "To"), not placeholders.

**7. Contrast fails WCAG AA.**
- `text-slate-400` on white is 2.6:1. It is used in 8 places: member "you", invitation status, file
  sizes, helper text and the magic-link note.
- Deleted transactions use `opacity-60` on the whole row, which drops all of its text below 4.5:1.
- The chart's "Planned" bar `#93c5fd` is about 1.9:1 against white.

*Fix:* use `--ink-3` (#666B74, 5.3:1) for hints. For deleted rows, show a "Deleted" badge and
strike through the title, without fading the row. Draw the Planned bar as an outline in `--primary`
and the Actual bar as a solid fill.

**8. Native dialogs.** The app calls `window.confirm` for deletes in Transactions, Diary and
Attachments, and `window.prompt` twice for budget revision (amount, then reason). These dialogs are
unstyled, ignore the brand, and are easy to dismiss by mistake on mobile.
*Fix:* add a `ConfirmDialog` with a destructive variant. Make budget revision a sheet with an amount
field, a reason field and validation. For soft deletes, prefer an "Undo" toast over a confirm.

### Medium

**9. Breakpoints.** The 224 px sidebar appears at `sm` (640 px), which leaves about 400 px for tables
on a small tablet. On a 1920 px monitor the content stretches edge to edge.
*Fix:* keep the bottom bar below `md` (768). At `md`, show a 72 px icon rail with labels. At `lg`
(1024), show the full 248 px sidebar. Wrap page content in `max-w-[1200px] mx-auto`.

**10. Bottom bar.** The tabs are text only, the bar ignores the iPhone home indicator, and `pb-16` on
the content does not match the bar's real height.
*Fix:* show an icon above each label (22 px icon, 12 px label, 56 px bar plus
`env(safe-area-inset-bottom)`). Set the same value as a CSS variable, `--bottom-nav-h`, and use it for
the content's padding. Add `viewport-fit=cover` to the viewport meta.

**11. Primary action placement.** "Add" is small, top-right and hard to reach one-handed, and it
toggles to "Close".
*Fix:* on mobile, use a 56 px floating action button 16 px above the bottom bar, labelled
"Add expense" (Dashboard) or showing an icon only (lists, with `aria-label`). On desktop, use a header
button. The button always opens the sheet and never toggles.

**12. Money formatting.** Lists use `₹{Number(x).toLocaleString('en-IN')}` while the dashboard uses
`Intl.NumberFormat` currency. Digits are proportional, so columns misalign.
*Fix:* create `src/lib/format.ts` with `formatINR(value, { compact })` (₹12,400 / ₹4.6L / ₹1.2Cr). Use
`tabular-nums` on every amount, align amount columns right, and show GST as "incl. ₹1,891 GST".

**13. Dates.** `new Date(x).toLocaleDateString()` formats in the device's locale and time zone,
which conflicts with the Asia/Kolkata rule.
*Fix:* add `formatDate(d)` → "14 Oct 2026" using `timeZone: 'Asia/Kolkata'`, plus relative "Today" /
"Yesterday" labels in lists. Group transactions and the timeline by day, with sticky day headers that
show the daily total.

**14. Status uses colour alone.** In `BudgetsView`, the % used is coloured text only, and red versus
green is unreadable for many colour-blind users.
*Fix:* use a `StatusBadge` with an icon and a word: "On track" (<80%), "Near limit" (80–100%) and
"Over" (>100%). Add a progress bar to each row.

**15. Budgets table on phones.** Six columns force horizontal scrolling.
*Fix:* below `md`, show one card per category with the name and badge, a progress bar,
"₹actual of ₹planned", and a full-width "Revise" button. At `md` and above, keep the table with
right-aligned numeric columns and a sticky total row.

**16. Filters on mobile.** The `grid` of five fields stacks into about 260 px before the first row of
data.
*Fix:* show a search field and a "Filters · n" button that opens a sheet. Show active filters as
removable chips under the header, plus "Clear all". On desktop, keep an inline filter bar.

**17. Loading, error and success feedback.** Loading is plain "Loading…" text and errors are
`text-red-600` paragraphs with no retry. Saving gives no confirmation.
*Fix:* use skeleton rows that match the list layout, an inline `Alert` (icon, message, Retry), and
toasts for save and delete ("Expense deleted · Undo"). Set `aria-live="polite"` on the toast region.

**18. Dashboard.** The three stat cards give no context. Recharts shows raw y-axis numbers, and the
x-axis category names overlap at 390 px.
*Fix:* add a hero "Budget used" card with a progress bar and remaining amount, and sub-lines on stat
cards ("since 2 Mar", "+12% vs last month"). Use horizontal bars (`layout="vertical"`) so names stay
readable, and a compact ₹ tick formatter. Make recent items link to the item, not just the list.

**19. Typography.** Every page `h1` is `text-lg`, the same visual weight as the card headers. The font
is the system stack.
*Fix:* adopt the scale in §3.2 and load it with `next/font` (Archivo for headings, IBM Plex Sans for
UI text).

**20. Colour tokens and dark mode.** Only `primary` is defined, and `color-scheme: light` is forced.
*Fix:* add the semantic CSS variables in §3.1, map them in `tailwind.config.ts`, and support
`prefers-color-scheme: dark`. Replace `bg-white` / `text-slate-*` with `bg-surface` / `text-ink-*`.

**21. Lightbox.** It does not trap or restore focus, the Close button is about 28 px, `alt=""` hides
the image's meaning, and there is no way to move between photos.
*Fix:* use a proper dialog (focus the close button on open and return focus on close), a 44 px close
button, prev/next buttons and swipe, the filename as caption and alt text, and a body scroll lock.

### Low

**22. Timeline.** It uses the 📝 emoji for diary entries. *Fix:* use a type icon in a tinted tile
(blue = expense, amber = diary) and group entries by day.

**23. Copy and labels.** Raw values appear in the UI: `upi`, `bank`, `(material)` and uppercased
roles. The login page shows "Requires magic link to be enabled for this project". *Fix:* use label maps
(`UPI`, `Bank transfer`, `Card`, `Credit`, `Material`) and remove developer-facing copy.

**24. Empty states.** *Fix:* show a one-line explanation and the primary action ("Add your first
expense"), and offer a "Clear filters" button when filters are hiding results.

**25. Login.** *Fix:* use `role="tablist"` / `role="tab"` for Sign in / Sign up. Order the methods as
Google first, then a divider, the email form, and "Email me a sign-in link" as a text button. Put
errors in `role="alert"`.

**26. Uploads.** *Fix:* replace the native input with "Camera" and "Upload" buttons (keeping a hidden
`<input capture>`). Add thumbnails, a per-file progress bar, Retry, and the limits ("10 files,
10 MB each").

**27. Project list.** *Fix:* make each card show the status pill, total spend and last entry date, and
make the whole card the 44 px+ link. Put "New project" behind a button, not an always-open form.

**28. PWA assets.** *Fix:* add 192 and 512 PNG icons, a separate maskable icon with a 20% safe zone,
`apple-touch-icon`, `theme-color` per scheme in `viewport.themeColor`, and the new background colour in
`manifest.json`.

---

## 3. Style system

### 3.1 Colour tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F5F4F0` | `#121417` | App background |
| `--surface` | `#FFFFFF` | `#1B1E23` | Cards, bars, sheets |
| `--surface-2` | `#EEEDE8` | `#252930` | Table headers, segmented controls |
| `--border` | `#DCDAD3` | `#343943` | Card and divider lines |
| `--border-strong` | `#B9B6AD` | `#4A505B` | Input borders |
| `--ink` | `#1A1D21` | `#ECEDEF` | Primary text |
| `--ink-2` | `#4A4F57` | `#B4B9C2` | Secondary text |
| `--ink-3` | `#666B74` | `#8D939D` | Hints, metadata (≥4.5:1) |
| `--primary` | `#1F4FD1` | `#7EA2FF` | Actions, links, active nav |
| `--primary-hover` | `#183FA8` | `#A3BDFF` | Hover / pressed |
| `--primary-tint` | `#E8EEFC` | `#1E2A4A` | Active nav, selected chips |
| `--on-primary` | `#FFFFFF` | `#0D1530` | Text on primary |
| `--accent` | `#F2A900` | `#F2A900` | Safety-amber highlight (fill only, ink text) |
| `--ok` / `--ok-tint` | `#1E7A3F` / `#E3F2E8` | `#5CC98A` / `#173323` | On track |
| `--warn` / `--warn-tint` | `#9A5B00` / `#FCEFD9` | `#F2B54A` / `#3A2A0E` | Near limit |
| `--danger` / `--danger-tint` | `#B42318` / `#FBE4E1` | `#FF8A80` / `#3D1A17` | Over budget, destructive |
| `--focus` | `#7EA2FF` | `#A3BDFF` | Focus ring |

`globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: light dark;
  --bg: #f5f4f0; --surface: #ffffff; --surface-2: #eeede8;
  --border: #dcdad3; --border-strong: #b9b6ad;
  --ink: #1a1d21; --ink-2: #4a4f57; --ink-3: #666b74;
  --primary: #1f4fd1; --primary-hover: #183fa8; --primary-tint: #e8eefc; --on-primary: #ffffff;
  --accent: #f2a900;
  --ok: #1e7a3f; --ok-tint: #e3f2e8;
  --warn: #9a5b00; --warn-tint: #fcefd9;
  --danger: #b42318; --danger-tint: #fbe4e1;
  --focus: #7ea2ff;
  --bottom-nav-h: calc(56px + env(safe-area-inset-bottom));
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #121417; --surface: #1b1e23; --surface-2: #252930;
    --border: #343943; --border-strong: #4a505b;
    --ink: #ecedef; --ink-2: #b4b9c2; --ink-3: #8d939d;
    --primary: #7ea2ff; --primary-hover: #a3bdff; --primary-tint: #1e2a4a; --on-primary: #0d1530;
    --ok: #5cc98a; --ok-tint: #173323;
    --warn: #f2b54a; --warn-tint: #3a2a0e;
    --danger: #ff8a80; --danger-tint: #3d1a17;
    --focus: #a3bdff;
  }
}

body {
  @apply bg-bg text-ink antialiased;
  font-family: var(--font-body), system-ui, sans-serif;
}

:where(a, button, input, select, textarea, summary, [tabindex]):focus-visible {
  outline: 3px solid var(--focus);
  outline-offset: 2px;
}

.num { font-variant-numeric: tabular-nums; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

`tailwind.config.ts` (extend):

```ts
colors: {
  bg: 'var(--bg)',
  surface: { DEFAULT: 'var(--surface)', 2: 'var(--surface-2)' },
  border: { DEFAULT: 'var(--border)', strong: 'var(--border-strong)' },
  ink: { DEFAULT: 'var(--ink)', 2: 'var(--ink-2)', 3: 'var(--ink-3)' },
  primary: { DEFAULT: 'var(--primary)', hover: 'var(--primary-hover)', tint: 'var(--primary-tint)', foreground: 'var(--on-primary)' },
  accent: 'var(--accent)',
  ok: { DEFAULT: 'var(--ok)', tint: 'var(--ok-tint)' },
  warn: { DEFAULT: 'var(--warn)', tint: 'var(--warn-tint)' },
  danger: { DEFAULT: 'var(--danger)', tint: 'var(--danger-tint)' },
},
fontFamily: {
  display: ['var(--font-display)', 'system-ui', 'sans-serif'],
  sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
},
borderRadius: { sm: '8px', md: '12px', lg: '16px', sheet: '24px' },
boxShadow: {
  e1: '0 2px 8px rgba(26,29,33,0.10)',
  e2: '0 12px 32px rgba(26,29,33,0.18)',
},
spacing: { 11: '2.75rem' /* 44px touch target */ },
```

### 3.2 Typography

Load the fonts with `next/font/google` in `src/app/layout.tsx`: `Archivo` (600, 700) as
`--font-display` and `IBM Plex Sans` (400, 500, 600) as `--font-body`, both with
`display: 'swap'`.

| Role | Size / line | Font, weight | Tailwind |
|---|---|---|---|
| Display (hero amount) | 32 / 36 (desktop 36 / 40) | Archivo 700 | `font-display text-[32px] leading-9 font-bold` |
| H1 page title | 24 / 30 (desktop 28 / 34) | Archivo 700 | `font-display text-2xl lg:text-[28px] font-bold` |
| H2 section | 18 / 24 | Archivo 600 | `font-display text-lg font-semibold` |
| Body | 16 / 24 | Plex 400 | `text-base` |
| Small / meta | 14 / 20 | Plex 400 | `text-sm text-ink-2` |
| Label | 13 / 16 | Plex 600 | `text-[13px] font-semibold` |
| Caption | 12 / 16 | Plex 500 | `text-xs` (never below 12 px) |
| Money | inherits | `tabular-nums`, right aligned | `num text-right` |

### 3.3 Spacing, radius, elevation

- **Spacing:** 4 px grid. Use 4, 8, 12, 16, 24, 32 and 48 for layout. Card padding is 16 on mobile and
  20–24 on desktop. Page gutters are 16 / 24 / 32 at base / md / lg.
- **Radius:** 8 for inputs and chips, 12 for buttons, 16 for cards, 24 for the top of a sheet, and
  999 for pills.
- **Elevation:** cards use a border only (e0). Sticky bars and the FAB use `e1`. Sheets, drawers and
  dialogs use `e2` with a `rgba(26,29,33,0.32)` scrim.

### 3.4 Breakpoints and layout shells

| Range | Shell | Navigation | Forms | Gutter |
|---|---|---|---|---|
| base < 640 | Sticky top bar (64 px) + content + bottom bar | 4 tabs: Dashboard, Expenses, Diary, More (icon + label) | Bottom sheet | 16 |
| sm 640–767 | Same as base, with 2-column grids | Bottom bar | Bottom sheet | 16 |
| md 768–1023 | 72 px icon rail + content | Rail with labels | Right drawer 440 px | 24 |
| lg ≥ 1024 | 248 px sidebar + content (max 1200, centred) | Sidebar with active state | Right drawer 440 px | 32 |

Rules:
- Use `min-h-dvh`, not `min-h-screen`, so mobile browser toolbars don't cut off content.
- The viewport meta includes `viewport-fit=cover`. Bars pad with `env(safe-area-inset-*)`.
- At most one primary button per screen region. Destructive actions sit apart from Save.
- Lists below `md` are cards or rows, and tables become available at `md`. Any table that can still
  overflow sits in an `overflow-x-auto` wrapper.
- Hit areas are at least 44×44 px everywhere, with at least 8 px between adjacent targets.

### 3.5 Components to build (`src/components/ui/`)

| Component | Notes |
|---|---|
| `Button` | Variants: primary, secondary, ghost, danger; sizes md (44) and lg (52); `loading` state with spinner and `aria-busy` |
| `IconButton` | 44×44, requires `aria-label` |
| `Field` | Label + control + hint + error (`aria-describedby`, `aria-invalid`), 16 px text on mobile |
| `MoneyInput` | `inputMode="decimal"`, ₹ prefix, groups digits in Indian format on blur |
| `Select`, `DateInput`, `Textarea` | Same chrome as `Field` |
| `Segmented` | Payment mode, Week/Month; `role="radiogroup"` |
| `ChipGroup` | Category picker in sheets, filter chips with remove buttons |
| `Sheet` | Bottom sheet below md, right drawer at md+; focus trap, Esc, scrim click, sticky footer |
| `ConfirmDialog` | Replaces `window.confirm` / `prompt` |
| `Toast` | Save / delete / undo, in an `aria-live` region |
| `Alert` | Error with Retry, and info |
| `Skeleton` | List row, stat card, table row |
| `StatusBadge` | On track / Near limit / Over, with an icon and a word |
| `ProgressBar` | Budget use, upload progress |
| `StatCard` | Label, value (tabular), sub-line, optional badge |
| `ListRow` | Leading tile or thumb, title, meta, trailing amount, overflow menu |
| `EmptyState` | Message + primary action |
| `NavLink` | Active styling + `aria-current` |
| `Lightbox` | Rebuilt: focus management, prev/next, swipe, caption |

Use one icon set (for example `lucide-react`) at 20–22 px with stroke width 2, and no emoji in the UI.

---

## 4. Screen-by-screen changes

**Login** (`src/app/login/page.tsx`): a centred card (max 400 px) on `--bg`, with the logo mark and
app name. Google comes first, then a divider, then the email form, then the magic-link text button.
Inputs are 48 px tall with 16 px text. On mobile the card fills the width with 16 px gutters.

**Projects** (`src/app/projects/page.tsx`): a header with the title and an account menu (email and
sign-out inside it). Project cards show the name, status pill, role, total spend and last activity.
On mobile, "New project" opens a sheet; on desktop it opens a dialog.

**Project shell** (`src/app/projects/[id]/layout.tsx`): use the shells in §3.4. On mobile the top
bar holds the back button, the project name (truncated) and a project switcher. The bottom bar has
icons, labels and an active pill.

**Dashboard** (`projects/[id]/page.tsx`): a hero "Budget used" card (dark surface, amber accent
when ≥ 80%), then stat cards (2 columns on mobile, 4 on desktop). Per-category progress rows replace
the vertical bar chart on mobile; on desktop, the planned-vs-actual horizontal bars sit beside
"Recent activity".

**Transactions** (`TransactionsView.tsx`): a sticky header with the title, count, search and the
Filters button, plus filter chips. Rows are grouped by day with daily totals. Each row has a leading
bill thumbnail or icon tile, the vendor, meta (category · mode · GST) and the amount, with actions in
a ⋯ menu. A FAB opens the Add sheet. On desktop, show a table with an inline filter bar, a filtered
total in the footer, and a click on a row opens the edit drawer. Load more replaces pagination on
mobile.

**Add/Edit expense sheet:** a large amount field first (it is the one value always entered), then
category chips, date and GST, vendor, payment segmented control, bill Camera/Upload with previews,
and notes. The sticky footer holds Cancel and Save. Edit mode adds Delete at the left of the footer.

**Diary** (`DiaryView.tsx`): cards on a vertical rail with day headers. Photos sit in a 3-up grid
(not a horizontal scroller on desktop) and open the lightbox. Add/Edit use the same sheet.

**Timeline** (`TimelineView.tsx`): day groups with a type tile (expense or diary) and amounts aligned
right. The date range uses a single range picker that opens as a sheet on mobile.

**Budgets** (`BudgetsView.tsx`): a header with the Week/Month segmented control and period stepper
(44 px buttons, readable label "October 2026" or "Week of 13 Oct"). Cards on mobile, a table on
desktop, with a StatusBadge and a progress bar per category. Revise opens a sheet.

**Members / Settings:** form sections in cards with a heading and helper text. Role changes use
a `Select` and confirm when a user is demoted. Remove buttons use the danger ghost style. Inactive
categories go into a collapsed "Inactive" group instead of being struck through.

**More** (`projects/[id]/more/page.tsx`): grouped list rows (icon, label, description, chevron) at
56 px or taller, with Sign out at the bottom.

---

## 5. Suggested order of work

1. **Foundation:** tokens in `globals.css` and `tailwind.config.ts`, fonts, focus style,
   `format.ts` (INR and IST dates), the `viewport-fit=cover` meta. Fixes 5, 7, 12, 13, 19 and 20.
2. **Shell:** `NavLink`, bottom bar with icons and safe area, md rail, lg sidebar, content max width.
   Fixes 1, 9 and 10.
3. **Primitives:** `Button`, `Field`, `MoneyInput`, `Sheet`, `ConfirmDialog`, `Toast`, `Alert`,
   `Skeleton`, `StatusBadge`. Fixes 2, 3, 6, 8 and 17.
4. **Transactions:** sheet/drawer form, FAB, filter sheet and chips, day grouping, desktop table.
   Fixes 4, 11 and 16.
5. **Dashboard and budgets:** hero card, progress rows, horizontal chart, budget cards. Fixes 14, 15
   and 18.
6. **Polish:** lightbox, timeline, diary grid, empty states, login, project cards, PWA icons.
   Fixes 21–28.

## 6. Acceptance checklist

- [ ] Lighthouse accessibility score ≥ 95 on Login, Dashboard, Transactions (mobile and desktop).
- [ ] No horizontal page scroll at 360, 390, 768, 1024, 1440 px.
- [ ] Every interactive element ≥ 44×44 px on touch devices; visible focus ring on keyboard.
- [ ] All text ≥ 4.5:1 contrast (3:1 for ≥ 24 px); status never conveyed by colour alone.
- [ ] No input zoom on iOS Safari; amount fields open the decimal keypad.
- [ ] Bottom bar and sheets clear the iPhone home indicator; nothing hidden behind the bar.
- [ ] Dark mode renders every screen with tokens only (no `slate-*` / `white` left in components).
- [ ] All amounts use `formatINR` + tabular numerals; all dates use `formatDate` in Asia/Kolkata.
- [ ] No `window.confirm` / `window.prompt` / emoji left in `src/`.
