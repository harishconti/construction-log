# Construction Ledger — Documentation Index

Authoritative infrastructure: **`08-INFRA-SETUP-CHECKLIST.md`** (Vercel + Neon + Cloudflare).
Everything else describes the app design; see **`09-IMPLEMENTATION-STATUS.md`** for what is actually built.

| Doc | Contents |
|---|---|
| [00-OVERVIEW.md](00-OVERVIEW.md) | Purpose, requirements, success criteria, tech stack, conventions |
| [01-ARCHITECTURE.md](01-ARCHITECTURE.md) | System diagram, components, request flows, failure/recovery |
| [02-DATA-MODEL.md](02-DATA-MODEL.md) | Prisma schema, design decisions, constraints |
| [03-API-SPEC.md](03-API-SPEC.md) | REST endpoints, validation rules, error shape |
| [04-ROLES-PERMISSIONS.md](04-ROLES-PERMISSIONS.md) | Per-project roles, enforcement, acceptance checks |
| [05-FRONTEND-UX.md](05-FRONTEND-UX.md) | Pages, UI patterns, PWA, design tokens |
| [06-DEPLOYMENT.md](06-DEPLOYMENT.md) | Vercel + Neon + R2 ops, env scopes, migrations, maintenance, backups |
| [07-CLAUDE-BUILD-PROMPT.md](07-CLAUDE-BUILD-PROMPT.md) | Build brief for a coding agent |
| [08-INFRA-SETUP-CHECKLIST.md](08-INFRA-SETUP-CHECKLIST.md) | **Authoritative** infra setup checklist |
| [09-IMPLEMENTATION-STATUS.md](09-IMPLEMENTATION-STATUS.md) | What is implemented vs pending, endpoints, schema, env, tests |

## Repository layout
```
src/app/            Next.js App Router (pages + /api route handlers)
src/components/     Client components (forms, views, charts)
src/lib/            Server logic: prisma, auth, requireRole, audit, r2, idempotency, period, budget…
prisma/             schema.prisma, seed.ts, migrations/
tests/              Vitest unit tests
docs/               This folder
```
