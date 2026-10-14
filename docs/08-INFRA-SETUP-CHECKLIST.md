# Infrastructure Setup Checklist — Vercel + Neon + Cloudflare

Updated: 14 October 2026
Status: Authoritative replacement for all previous infrastructure checklists.

## 1. Final stack

```text
Browser / mobile PWA
  | HTTPS: build.harishspace.in
  v
Vercel: Next.js UI + backend routes
  |-- Neon PostgreSQL: shared project data
  |-- Neon Auth: identity and sessions
  |-- Cloudflare R2: private bills and diary images

Cloudflare DNS routes the app hostname to Vercel.
Hostinger remains the domain registrar.
```

NOT required: Railway, Oracle VM, Cloudflare Tunnel, cloudflared, Supabase, Workers, Pages, Redis or a public image domain.

Vercel Hobby is intended for personal, non-commercial projects. Use this setup for your own house ledger; reassess eligibility if it becomes business software or a commercial SaaS. All free tiers have limits; zero monthly cost is a target, not a guarantee.

## 2. Before coding versus before launch

### Before integration development
- [ ] Git repository created; secrets excluded from Git.
- [ ] Neon database available and development connection details saved.
- [ ] Neon Auth enabled and development Auth URL collected.
- [ ] Private R2 development bucket and scoped credentials ready.
- [ ] Localhost included in development Auth settings and R2 CORS.
- [ ] Local .env.local configured.

### Before production launch
- [ ] Vercel app deployed and production secrets configured.
- [ ] Cloudflare domain Active with existing DNS records preserved.
- [ ] build.harishspace.in connected to Vercel with valid HTTPS.
- [ ] Production database/Auth/bucket isolated from development.
- [ ] Permissions, migrations, uploads and backup restore tested.

You DO NOT need a finished production domain or deployment to start coding.

## 3. GitHub and local setup

- [ ] Create private repository: construction-ledger (suggested).
- [ ] Add .env, .env.local and other credential files to .gitignore.
- [ ] Commit only placeholder .env.example.
- [ ] Install Node version supported by your chosen Next.js release and Vercel.
- [ ] Keep package lockfile committed.
- [ ] Decide on a supported Prisma version and validate its configuration explicitly.
- [ ] Do not paste real secrets into coding-agent chats.

## 4. Neon setup

### 4.1 Project and region
- [ ] Use existing project or create construction-ledger.
- [ ] Enable Postgres database and Neon Auth / Managed Better Auth.
- [ ] Leave Object Storage, Functions and AI Gateway OFF.
- [ ] Confirm Free plan and current quotas in dashboard.
- [ ] Choose database region close to the Vercel backend execution region; explicitly configure the latter where the plan permits.
- [ ] Do not assume choosing a domain changes backend execution location.

### 4.2 Environment isolation
- [ ] Production branch/database reserved for real records.
- [ ] Development branch/database used for local work.
- [ ] Preview deployments use a separate branch/database or are deliberately disabled until configured safely.
- [ ] Record which branch each DATABASE_URL and Auth URL belongs to.
- [ ] Never give preview builds production database or R2 credentials by default.
- [ ] Avoid copying sensitive production records into public/test previews.

### 4.3 Database details
From Neon Connection Details, collect:
- [ ] Pooled Postgres URL for runtime use.
- [ ] Direct Postgres URL for migration/admin tools where required.
- [ ] Branch, database, role and region.
- [ ] Preserve provider TLS parameters; never disable certificate verification as a workaround.

DATABASE_URL and DIRECT_URL below are application conventions, not a promise that every Prisma release automatically reads both. Configure the selected ORM version correctly. Use a connection approach suited to serverless environments: a supported pooled PostgreSQL client/Prisma setup or Neon serverless driver.

For production hardening, use restricted runtime credentials and separate migration credentials. Never expose SQL credentials to the browser.

### 4.4 Neon Auth
- [ ] Copy actual Auth URL from the correct branch in Neon Console.
- [ ] Generate cookie secret: openssl rand -base64 32.
- [ ] Add http://localhost:3000 to development origins/redirects required by current SDK.
- [ ] Add https://build.harishspace.in to production settings.
- [ ] Add exact Vercel test hostname only when needed. Do not allow all *.vercel.app origins indiscriminately.
- [ ] Review email verification, password recovery and sign-up controls.
- [ ] Test email delivery; configure mail/provider settings if required.

Use current Neon Auth Next.js SDK documentation. Do not implement Supabase Auth, custom password storage or custom JWT issuance alongside it.

App permission design:
- profiles references the verified Neon user ID and stores app-specific information.
- project_members stores project_id, user_id and admin/editor/viewer role.
- New sign-ups receive no automatic membership in existing projects.
- Bootstrap the initial admin via explicit seed/CLI for a known user ID. Avoid a public first-sign-up-wins-admin route.
- Every project read, write and attachment URL request checks session AND current project membership.
- Keep application migrations out of provider-managed Auth schemas.

## 5. Cloudflare DNS and Hostinger

Domain: harishspace.in
App hostname: build.harishspace.in

### 5.1 Preserve existing DNS
- [ ] Export/screenshot Hostinger DNS before changing nameservers.
- [ ] Check Cloudflare imported website and email records.
- [ ] Earlier screenshots showed A @ -> 2.57.91.91 and CNAME www -> harishspace.in. Verify they remain correct; these are not Vercel targets.
- [ ] Preserve MX, SPF, DKIM, DMARC and ownership records if present.
- [ ] If DNSSEC is active, follow Cloudflare migration guidance for the old registrar DS record before switching providers.

### 5.2 Activate the zone
Hostinger: Domains -> harishspace.in -> DNS/Nameservers -> Change Nameservers.
The earlier Cloudflare screenshot assigned:

```text
randy.ns.cloudflare.com
veronica.ns.cloudflare.com
```

- [ ] Verify the current Cloudflare dashboard still assigns these exact values.
- [ ] Replace nova.dns-parking.com and cosmos.dns-parking.com in the registrar NAMESERVER settings.
- [ ] Do not add them as ordinary A/CNAME records.
- [ ] Wait for Cloudflare zone status Active.
- [ ] Verify existing website and email remain working.

### 5.3 Connect Vercel after initial deployment
- [ ] Vercel project -> Settings -> Domains -> Add build.harishspace.in.
- [ ] Copy the exact DNS instructions supplied by Vercel for THIS project/domain.
- [ ] Add its CNAME and any ownership-verification TXT records requested in Cloudflare DNS.
- [ ] Start with CNAME DNS-only (grey cloud), simplifying verification and troubleshooting.
- [ ] Remove only conflicting records for build, not @ or www.
- [ ] Wait for Vercel valid domain status and HTTPS certificate.
- [ ] Verify https://build.harishspace.in.
- [ ] Update app URL, Auth settings and production R2 CORS.

Do not guess the Vercel target and do not reuse Railway CNAME/TXT instructions. DNS-only means Cloudflare is DNS provider, not an app traffic proxy/WAF. Proxying can be evaluated later with current Vercel guidance; avoid Flexible SSL.

## 6. Cloudflare R2

### 6.1 Buckets
- [ ] Activate R2; review payment-method/billing requirements and current free quotas.
- [ ] Create construction-ledger-dev, Standard storage, private.
- [ ] Before launch create construction-ledger-prod, also private.
- [ ] Keep public r2.dev access disabled.
- [ ] Do not attach public image domains.
- [ ] Review object retention/deletion policies before applying lifecycle rules.

### 6.2 Credentials
R2 -> Manage R2 API Tokens -> Create API token:
- [ ] Object Read & Write, restricted to the relevant bucket.
- [ ] Separate development and production credentials preferred.
- [ ] Collect Account ID, Access Key ID, Secret Access Key, bucket name and S3 endpoint.
- [ ] Store in password manager and server-only environment variables.

Endpoint: https://<account-id>.r2.cloudflarestorage.com

### 6.3 CORS
Development bucket settings -> CORS:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Production bucket uses AllowedOrigins ["https://build.harishspace.in"]. Add exact approved Vercel test origin only if needed. Additional request headers must match the implemented upload flow; extend the allowlist only as required.

CORS is not authorization. Bucket stays private; temporary signed URLs are issued only after project membership checks. Presigned URLs use the R2 S3 endpoint, not a custom public image domain.

### 6.4 Required upload implementation
1. Backend verifies session, project, parent permissions, MIME allowlist and requested size.
2. Backend creates pending attachment row and random project-scoped object key.
3. Backend issues short-lived PUT signature.
4. Browser uploads directly to R2, with matching Content-Type.
5. Finalize endpoint checks object existence and actual size/metadata, validates content as appropriate, then marks ready and links it to the record.
6. Downloads receive short-lived GET signatures after membership checks.
7. Scheduled cleanup handles orphan/pending uploads and deletion retries.

Never send full image bytes through Vercel as the default flow. Never trust arbitrary client object keys. Never store signed URLs as permanent file URLs.

Suggested initial policy: ten images per record, 10 MB each, JPEG/PNG/WebP; show clear unsupported-HEIC feedback. Preserve readable original bills. Attachments have explicit transaction_id OR diary_entry_id with a database check enforcing exactly one parent when attached. Pending uploads need a separate documented state/constraint.

## 7. Vercel setup

### 7.1 Project
- [ ] Confirm Hobby eligibility: personal/non-commercial use.
- [ ] Import existing GitHub repository as a Next.js project.
- [ ] Use existing Neon project via supported integration or manual env variables; do not accidentally provision a duplicate database.
- [ ] Keep default Next.js build configuration unless repo structure requires changes.
- [ ] Configure backend execution region close to Neon where available.
- [ ] Review deployment protection settings; test Auth redirects if protection is enabled.

### 7.2 Environment scopes
Set separate variables in Development, Preview and Production:
- [ ] Development -> development Neon/Auth/R2.
- [ ] Preview -> separate preview/test resources, never automatic production credentials.
- [ ] Production -> production branch/Auth/R2.
- [ ] Redeploy after modifying environment variables that require a new deployment.
- [ ] NEXT_PUBLIC_* values are browser-visible and often embedded at build time; never use for secrets.

### 7.3 Runtime restrictions
- API routes/services must be serverless-compatible.
- No permanent local file storage, local SQLite production database, daemon, WebSocket server or infinite worker loop.
- Use managed database and object storage for persistence.
- Check current function payload/runtime limits; direct R2 uploads avoid app upload payload bottlenecks.
- Avoid request-time schema migrations.
- Long backups/maintenance jobs run outside request handlers using a controlled scheduler/tool.
- For scheduled cleanup, choose Vercel Cron only if current Hobby frequency/runtime limits fit; otherwise use a separate scheduled job. Authenticate maintenance endpoints.

### 7.4 Launch
- [ ] Run build/typecheck/tests locally.
- [ ] Apply reviewed production migrations in controlled release process with backup first.
- [ ] Deploy and test generated Vercel domain.
- [ ] Attach custom domain per section 5.3.
- [ ] Health endpoint exposes no secrets or private data.
- [ ] Watch errors, function usage and quotas.

## 8. Environment template

Create .env.local; commit only placeholder .env.example:

```dotenv
# Server-only Neon database credentials
DATABASE_URL=<pooled-neon-postgres-url-with-provider-tls-settings>
DIRECT_URL=<direct-migration-url-if-required-by-orm>

# Server-only Neon Auth settings
NEON_AUTH_BASE_URL=<actual-branch-auth-url>
NEON_AUTH_COOKIE_SECRET=<openssl-rand-base64-32-output>

# Local app origin; production becomes https://build.harishspace.in
APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Server-only R2 credentials
R2_ACCOUNT_ID=<account-id>
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=<scoped-access-key>
R2_SECRET_ACCESS_KEY=<scoped-secret>
R2_BUCKET=construction-ledger-dev
R2_REGION=auto
```

Optional: MAINTENANCE_SECRET only if protected maintenance endpoints are implemented.

No Railway variables, Tunnel token, Oracle keys, Supabase variables, custom JWT_SECRET or R2_PUBLIC_URL. Verify variable names against installed SDK configuration rather than assuming examples work unchanged.

## 9. Secure inventory

| Detail | Development | Production |
|---|---|---|
| Git repository / Vercel project | | |
| Neon project, branch, region | | |
| Database name and role | | |
| DATABASE_URL / DIRECT_URL | Password manager | Password manager |
| Neon Auth URL | | |
| Cookie secret | Password manager | Password manager |
| Auth permitted origins | localhost | app domain |
| R2 bucket | construction-ledger-dev | construction-ledger-prod |
| R2 account / endpoint | | |
| R2 credentials | Password manager | Password manager |
| R2 CORS origins | localhost | app domain |
| Vercel test hostname | | |
| Custom hostname | optional | build.harishspace.in |
| Vercel required DNS records | | |

## 10. Data and permission acceptance checks

- [ ] All users read/write the same production database through authorized backend services.
- [ ] Viewer POST/PATCH/DELETE denied even via manual API calls.
- [ ] Project A member cannot access project B transactions, diary, budgets or images.
- [ ] Removed member loses access when server membership is rechecked.
- [ ] Last admin cannot be removed/demoted accidentally.
- [ ] New sign-up cannot claim existing project ownership.
- [ ] Monetary arithmetic uses decimal or integer paise, never float.
- [ ] amount is documented as GST-inclusive total; GST is not double-counted.
- [ ] Date boundaries use project timezone Asia/Kolkata; weeks start Monday.
- [ ] Weekly/monthly budget views are not added together.
- [ ] Audit and budget revisions written atomically with mutations.
- [ ] Optimistic version checks prevent silent concurrent overwrite.
- [ ] Idempotency keys prevent duplicate create/finalize requests on retry.
- [ ] Soft-delete rules and budget actual/refund behaviour documented.
- [ ] Private API responses not cached publicly by CDN/service worker.
- [ ] Offline forms clearly show unsaved state; no implied offline write sync in v1.
- [ ] Bill upload and diary multi-image gallery tested on phone.

## 11. Backups and ongoing operations

- [ ] Establish encrypted database exports: suggested seven daily and four weekly copies.
- [ ] Use secure scheduled tool outside Vercel request runtime when exports are long-running.
- [ ] Store backups in separate private bucket and ideally an independent provider/local copy.
- [ ] Test restore into isolated database before launch.
- [ ] Document managed Auth/config recovery; business-table SQL dump alone may not restore Auth service settings.
- [ ] Keep independent copies of important photos; R2 durability is not a deletion-proof backup.
- [ ] Monitor Neon compute/storage/transfer, R2 storage/operations and Vercel usage.
- [ ] Expect database wake-up latency after idle; don't keep it awake with pointless heartbeats.
- [ ] Reassess paid tiers for commercial use or stronger availability needs.

## 12. Reconcile older design documents before coding

Earlier files may contain incompatible assumptions. They must be updated:
- Replace Railway/Oracle deployment with Vercel.
- Replace custom password/JWT auth with current Neon Auth.
- Replace production Docker Postgres with Neon.
- Remove public bucket/permanent signed URL assumptions.
- Fix incomplete Prisma reverse relations and polymorphic attachment relations; validate schema before migrations.
- Align editor permissions: editors may edit transactions; diary edits author/admin; deletion/restore admin-only unless explicitly changed.
- Add project-isolation, final-admin safeguard, concurrency and idempotency tests.

This checklist changes infrastructure, not the core requirement for roles, transactions, diary photos, budgets and history.

## 13. Coding-agent handoff

> Treat this document as authoritative over old infrastructure instructions. Use Next.js on Vercel, Neon PostgreSQL plus Neon Auth, and private Cloudflare R2. Read current official Neon Auth Next.js documentation and use supported APIs for the installed SDK. Keep project authorization server-side and uploads direct-to-R2 with a validated finalize step. First reconcile schema, permissions and environment names; show the plan; then implement schema/auth/transaction CRUD and tests. Never request real secrets in chat. Local development does not require production DNS. Provide Vercel deployment instructions, not Oracle/Railway provisioning.

## Official sources for implementation verification

- Vercel Hobby: https://vercel.com/docs/plans/hobby
- Vercel pricing: https://vercel.com/pricing
- Vercel domains: https://vercel.com/docs/domains/working-with-domains/add-a-domain
- Neon Vercel integrations: https://neon.com/docs/guides/vercel-overview
- Neon Next.js connections: https://neon.com/docs/guides/nextjs
- Neon Auth: https://neon.com/docs/auth/quick-start/nextjs-api-only
- Neon Auth troubleshooting: https://neon.com/docs/auth/troubleshooting
- R2 signed URLs: https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- R2 CORS: https://developers.cloudflare.com/r2/buckets/cors/
- R2 credentials: https://developers.cloudflare.com/r2/api/tokens/
- R2 pricing: https://developers.cloudflare.com/r2/pricing/

Dashboard interfaces, SDK APIs and free quotas change. Verify actual configuration rather than copying historical limits blindly.
