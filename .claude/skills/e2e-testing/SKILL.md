---
name: e2e-testing
description: Browser and end-to-end testing for Construction Ledger — the Playwright suite in e2e/ (public read-only tier and the opt-in authed tier) and ad-hoc exploratory checks with the agent-browser CLI. Use when adding/running UI or e2e tests, checking a screen in a real browser, testing mobile/dark mode/accessibility, or debugging a Playwright failure.
---

# E2E & browser testing

Two tools, two jobs:
- **Playwright Test** (`e2e/`, `playwright.config.ts`): the committed, repeatable suite that CI runs.
- **agent-browser CLI**: interactive look-around while developing (screenshots, poking a flow,
  checking a layout). Run `agent-browser skills get core --full` once per session first.
  Don't turn agent-browser sessions into the regression suite — encode anything worth keeping as a
  Playwright test.

## Playwright layout
| Path | Project(s) | Writes data? |
|---|---|---|
| `e2e/public/*.spec.ts` | `public-desktop` (Desktop Chrome), `public-mobile` (Pixel 7) | **No** — signed out only |
| `e2e/auth.setup.ts` | `setup` — signs in via the login form, saves `e2e/.auth/user.json` | No |
| `e2e/authed/*.spec.ts` | `authed` (Pixel 7, uses the saved session) | **Yes** |

Public tier covers: login UI + labels + 44px targets, axe (WCAG A/AA, light + dark), dark tokens,
page redirects to `/login`, **every API route → 401 `{ error, code: 'UNAUTHORIZED' }`**, maintenance
secret, `/api/health` shape, security headers/CSP, PWA manifest/icons, service-worker API bypass.

## Running
```bash
npm run build && npm run test:e2e            # public tier, boots next start on :3100
npx playwright test e2e/public/login.spec.ts --project=public-mobile
npm run test:e2e:ui                          # interactive runner
npm run test:e2e:report                      # open last HTML report (traces on failure)
E2E_BASE_URL=https://build.harishspace.in E2E_EXPECT_HSTS=1 npx playwright test   # public tier vs a deploy
```
`reuseExistingServer` is on locally — if a stale `next start`/`next dev` is on :3100 it will be used.

### Authed tier (writes!)
```bash
E2E_ALLOW_WRITES=1 E2E_EMAIL=... E2E_PASSWORD=... npm run test:e2e
```
- Only against a **Neon dev branch** (+ dev R2 bucket) — never production. Check `DATABASE_URL`
  before running; local `.env` has historically pointed at production.
- Needs an email/password account on that branch's Neon Auth.
- Each spec creates its own project (`E2E <timestamp>`, `E2E admin <timestamp>`); there's no project
  delete API, so they're marked `completed` afterwards.
- `ledger.spec.ts` (UI, mobile): create project → admin + default categories; add expense via FAB
  sheet; GST > amount → 400 `INVALID_GST`; edit bumps `version`, stale write → 409
  `VERSION_CONFLICT`; `Idempotency-Key` replay returns the same row, reuse with a different body →
  409; admin delete + Undo toast; diary entry; no horizontal overflow on any page; unknown project → 404.
- `admin.spec.ts` (API, own project): soft-deleted expenses excluded from dashboard/budgets/timeline/
  recent and back after restore; deleted rows can't be edited; budget upsert 201→200; variance status
  green/yellow/red; revisions append-only newest-first; stale budget write → 409; pending invitation
  create/cancel; last admin can't be demoted/removed (409).

## Writing tests
- Locate by role/label like a user: `getByRole('dialog', { name: 'Add expense' })`,
  `getByLabel('Amount')` (works because `Field` wires `for`/`id`), `getByRole('radio', { name: 'UPI' })`
  for `Segmented`. Sheets/dialogs are `role="dialog"` named by their title. Avoid CSS selectors.
- Mobile-first: FAB `Add expense` only exists below `md`; desktop uses the header button.
- New protected endpoint → add it to the list in `e2e/public/auth-gate.spec.ts`.
- New screen → axe check in light **and** dark. Set `page.emulateMedia({ colorScheme })` **before**
  `goto`: flipping the scheme on a live page makes axe sample colours mid-`transition` and report
  contrast failures no user sees.
- Assert API contracts via `request` (shares the signed-in cookies in the authed tier) using
  status + `code`.
- Anything that creates data belongs in `e2e/authed/`, uses unique `stamp`-suffixed names, and must
  tolerate re-runs.

## Debugging a failure
1. `npm run test:e2e:report` → open the trace (DOM snapshots, network, console per step).
2. Re-run one test with `--repeat-each=5` to tell flake from bug.
3. If only one viewport fails, check responsive classes (`md:hidden`, rail at `md`, sidebar at `lg`).
4. Look at the live page with agent-browser (`open` → `snapshot -i`) to confirm what a user sees.
