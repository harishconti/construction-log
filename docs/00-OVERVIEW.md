# Construction Ledger — Project Overview

> Infrastructure is defined by `08-INFRA-SETUP-CHECKLIST.md` (Vercel + Neon + Cloudflare), which is
> authoritative over any older note in this repo. These docs describe the design; see
> **`09-IMPLEMENTATION-STATUS.md`** for what is actually built (most of the app is implemented).

## Purpose
A self-hosted-style web + mobile (PWA) application to track all financial transactions, site
diary/observations, and weekly/monthly budgets for a personal house-construction project in India.

## Core Requirements
1. **Roles**: Admin, Editor, Viewer — per project, enforced server-side.
2. **Transaction tracking**: material, labour, taxes (GST), electricity, misc — with date, vendor,
   amount, GST, payment mode, notes, and bill photos.
3. **Project timeline**: chronological view of all transactions + diary entries.
4. **Diary / site log**: dated observations with title, body, and multiple image attachments.
5. **Budget tracking**: weekly and monthly planned vs actual per category, with full revision history.
6. **Multi-user, consistent data**: all users read/write the same Neon PostgreSQL database; no
   local-first sync in v1.
7. **Mobile + Web**: one responsive Next.js app, installable as a PWA.
8. **Hosting**: Next.js on **Vercel**, **Neon PostgreSQL** for data, **Neon Auth** for identity,
   private **Cloudflare R2** for images, public hostname `build.harishspace.in` via Cloudflare DNS.

## Non-Goals (v1)
- Offline-first write queuing / conflict resolution
- Multi-project portfolio dashboards
- Invoice generation / GST filing
- Native iOS/Android apps (PWA is sufficient)
- Real-time collaboration (WebSocket/live cursors)

## Success Criteria
- Admin can create a project, invite members with roles, set budgets.
- Editor can add transactions with a bill photo from a phone; viewer sees read-only.
- Diary entry with 3+ photos renders correctly on mobile.
- Weekly/monthly budget vs actual variance is accurate and derived live from transactions.
- Every mutation is recorded in an immutable audit log.
- App is reachable at `https://build.harishspace.in` (Vercel + Cloudflare DNS, HTTPS).
- A new deployment/rollback is possible from Git via Vercel without manual server provisioning.

## Tech Stack (locked)
| Layer | Choice |
|---|---|
| Frontend + Backend | Next.js (App Router), TypeScript, React 18 |
| Styling | Tailwind CSS |
| DB ORM | Prisma |
| Database | Neon PostgreSQL (serverless; pooled `DATABASE_URL`, direct `DIRECT_URL` for migrations) |
| Auth | Neon Auth (Managed Better Auth) via `@neondatabase/auth`; httpOnly session cookies |
| Image storage | Cloudflare R2 (private bucket, S3-compatible, presigned PUT/GET) |
| Hosting | Vercel (Hobby) — Next.js UI + serverless API routes |
| DNS | Cloudflare (domain registered at Hostinger) |
| Charts | Recharts |
| PWA | Manual `manifest.json` + custom service worker (no `next-pwa`) |

Not used: Railway, Oracle Cloud VM, Cloudflare Tunnel/`cloudflared`, Docker Compose, Supabase,
custom JWT/`bcrypt`, public R2 image domain, `R2_PUBLIC_URL`.

## Conventions
- **Money**: stored as `Decimal(12,2)` (integer paise internally where possible); never float.
  `amount` is the **GST-inclusive total**; `gstAmount` is the tax component already included — it is
  **not** added on top.
- **Dates/timezone**: wall-clock boundaries use `Asia/Kolkata`; weeks start **Monday**.
- **Budget actual**: never stored; always derived from transactions.
