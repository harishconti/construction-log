---
name: testing
description: Run or write tests for Construction Ledger — which checks to run before a commit/PR, and how to write Vitest unit tests (including mocking Prisma for server guards). Use when verifying a change, adding test coverage, fixing a failing test, or asked to "run all tests". For browser/e2e work use the e2e-testing skill.
---

# Testing

## The full gate (what CI runs, in order)
```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e
```
`test:e2e` boots `next start` on :3100 from the last build, so **build first**. All of these are
read-only and safe with any `.env`. The authed e2e tier is opt-in — see the `e2e-testing` skill.

Pick the subset that matches the change:
| Changed | Run |
|---|---|
| `src/lib/**`, schemas, route logic | `npm test` (+ `npm run test:coverage` to see gaps) |
| API route auth/headers/status codes | `npm test` + `npm run build && npm run test:e2e` |
| UI / pages / styles | `npm run build && npm run test:e2e`, plus an agent-browser look (e2e-testing skill) |
| Prisma schema | `npx prisma generate && npm run typecheck && npm test` |

## Unit tests (Vitest 5, `tests/**/*.test.ts`, node env)
Import from `../src/...` (relative paths). One file per area:
`api` (error mapping, parseJson, pagination) · `api-client` (fetch mocked) · `format` (INR, IST) ·
`period` · `validation` · `files` · `roles` · `maintenance` · `guards` (requireRole, rateLimit,
writeAudit, withIdempotency, linkAttachments with Prisma mocked) · `audit` (regressions for
`docs/11-AUDIT.md` findings — despite the name it is not about `audit.ts`).

### Mocking Prisma (pattern from `tests/guards.test.ts`)
```ts
const db = vi.hoisted(() => ({ projectMember: { findUnique: vi.fn() }, $transaction: vi.fn() }));
vi.mock('../src/lib/prisma', () => ({ prisma: db }));
import { requireRole } from '../src/lib/requireRole'; // import AFTER vi.mock
beforeEach(() => vi.resetAllMocks());
```
- For code that takes a `tx` (`writeAudit`, `linkAttachments`) pass a plain object cast with
  `as Prisma.TransactionClient` — no module mock needed.
- For `prisma.$transaction(fn)`: `db.$transaction.mockImplementation(async (fn) => fn(fakeTx))`.
- Assert on **status + code** (`rejects.toMatchObject({ status: 409, code: 'VERSION_CONFLICT' })`),
  the API contract clients depend on — not on message text.
- Build Prisma errors with `new Prisma.PrismaClientKnownRequestError('x', { code: 'P2002', clientVersion: '5.22.0' })`.

### What to test
- Every new zod schema: one valid case + the boundary that should fail (money >0, ≤2 dp, max lengths).
- Time logic with fixed instants near IST midnight (e.g. `2026-10-14T19:00:00Z` = 00:30 IST next day).
- Each new guard/branch that returns a distinct error `code`.
- Route handlers themselves aren't unit-tested (they need a session + DB); their auth contract is
  covered by `e2e/public/auth-gate.spec.ts` and their behaviour by `e2e/authed/`.

## When a test fails
Reproduce with one file (`npx vitest run tests/guards.test.ts -t "requireRole"`). Decide whether the
code or the test is wrong by checking the spec in `docs/03-API-SPEC.md` / `docs/04-ROLES-PERMISSIONS.md`
— don't "fix" a test to match a behaviour the docs say is a bug. After adding tests, update the count
in `docs/09-IMPLEMENTATION-STATUS.md` → Verification.
