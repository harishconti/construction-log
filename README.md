# Construction Ledger

A shared, mobile-first ledger for running a home-construction project: log expenses with bill photos,
keep a site diary, set weekly/monthly budgets per category and track actual vs planned. Each
project has its own members with **admin / editor / viewer** roles.

Live at `https://www.harishspace.in`.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind · Prisma 5 · Neon Postgres ·
Neon Auth · Cloudflare R2 (private, presigned uploads) · Vercel · Vitest.

## Features
- **Expenses**: amount + GST, vendor, category, payment mode, bills/photos; filters, vendor search,
  day grouping, soft delete with undo (admin), restore.
- **Diary**: dated site notes with photos; author/admin edit.
- **Budgets**: planned vs derived actual per category, week/month, revision history.
- **Dashboard & timeline**: budget-used hero, planned-vs-actual chart, merged activity feed.
- **Members**: invite by email (works before the person signs up), role changes, last-admin guard.
- **PWA**: installable, works well on phones.
- **Safety**: optimistic locking, idempotent creates, audit log on every write, rate limits, DB CHECK
  constraints, security headers, magic-byte checks on uploads.

## Getting started
Requirements: Node 22, a Neon project with Neon Auth enabled, an R2 bucket with CORS for your origin.

```bash
npm install
cp .env.example .env          # fill in Neon + R2 values (see comments in the file)
npx prisma migrate deploy     # apply schema (use a Neon dev branch, not production)
npm run db:seed               # optional sample data
npm run dev                   # http://localhost:3000
```

| Script | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server / production build / serve |
| `npm run lint` · `typecheck` · `test` | ESLint · `tsc --noEmit` · Vitest unit tests |
| `npm run test:e2e` | Playwright browser tests (run `npm run build` first) |
| `npm run prisma:migrate` · `prisma:deploy` | Create a migration (dev) · apply migrations |
| `npm run db:backup` · `db:restore` | Encrypted `public`-schema backup to R2 / restore |

CI runs lint, typecheck, unit tests, build and the read-only e2e suite on every push.

## Documentation
Everything is in [`docs/`](docs/README.md). Start with:
- [`09-IMPLEMENTATION-STATUS.md`](docs/09-IMPLEMENTATION-STATUS.md): what is built and what's left
- [`01-ARCHITECTURE.md`](docs/01-ARCHITECTURE.md) and [`02-DATA-MODEL.md`](docs/02-DATA-MODEL.md)
- [`10-OPERATIONS.md`](docs/10-OPERATIONS.md): environments, releases, backups

Coding agents: see [`CLAUDE.md`](CLAUDE.md) and the project skills in `.claude/skills/`.

## License
Apache 2.0, see [LICENSE](LICENSE).
