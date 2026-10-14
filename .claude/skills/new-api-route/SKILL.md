---
name: new-api-route
description: Add or modify a REST route handler under src/app/api in Construction Ledger. Use when creating a new endpoint, adding a method to an existing route, or changing auth/validation/audit behaviour of an API route.
---

# Adding an API route

Every handler follows the same shape. Copy the closest existing route (e.g.
`src/app/api/projects/[id]/transactions/route.ts` for list+create,
`.../transactions/[txId]/route.ts` for update/delete) rather than writing from scratch.

## Checklist
1. **Params** — Next 16 params are a Promise:
   `type Ctx = { params: Promise<{ id: string; xId: string }> };` then `const { id } = await paramsPromise;`
2. **Wrap** — `export const POST = handle<Ctx>(async (req, { params: paramsPromise }) => { … })`.
   `handle()` maps `ApiError`, zod (422), Prisma P2002/P2025/P2034 to `{ error, code }`.
3. **AuthN/AuthZ (in this order)** — `const user = await requireUser();`
   `await requireRole(projectId, user.id, 'viewer' | 'editor' | 'admin');`
   Min roles: reads = viewer; creates/edits of ledger data = editor; delete/restore, members,
   settings, categories = admin. Diary edit = author **or** admin (check `createdBy` after loading).
4. **Rate limit** writes that users can spam: `await rateLimit(\`<bucket>:${user.id}\`, n, WINDOW.minute)`.
5. **Validate** — add/extend a zod schema in `src/lib/validation/schemas.ts` (reuse `moneyPositive`,
   enums, `.trim()`, max lengths) and `const body = await parseJson(req, schema);`.
   Query params: `getPagination(url)`, `parseOptionalDate(...)` (422 on bad dates).
6. **Project scoping** — load the row, then `if (!row || row.projectId !== projectId) throw ApiError.notFound(...)`.
   Cross-check referenced ids too (e.g. category belongs to the project and `isActive`).
7. **Mutate atomically** —
   ```ts
   await prisma.$transaction(async (tx) => {
     const res = await tx.thing.updateMany({ where: { id, version: before.version }, data: { …, version: { increment: 1 } } });
     if (res.count === 0) throw new ApiError(409, 'VERSION_CONFLICT', '… was modified by someone else');
     await writeAudit(tx, { entity, entityId, action, actorId: user.id, before, after });
   });
   ```
   - New `AuditEntity`/`AuditAction` values go in `src/lib/audit.ts`.
   - Creates of user-entered records use `withIdempotency({ projectId, userId, key: req.headers.get('idempotency-key'), body }, async (tx) => …)`.
   - Attachments: `linkAttachments(tx, …)` inside the same tx; deletes enqueue R2 keys to `ObjectDeletion`.
   - Soft delete = set `deletedAt` (+ version bump); list queries filter `deletedAt: null` unless admin asks.
8. **Respond** — `return json({ thing }, 201)`; Decimals as `.toString()`; attachments via `serializeAttachments`.
9. **Client** — call through `api.get/post/patch/delete` in `src/lib/api-client.ts`; handle
   `ApiClientError.code` (`VERSION_CONFLICT` → reload prompt, `RATE_LIMITED` → toast).
10. **Tests/docs** — unit-test any new pure logic in `tests/` (schemas, period math); add the endpoint
    to `docs/03-API-SPEC.md` and the table in `docs/09-IMPLEMENTATION-STATUS.md`.

## Verify
`npm run typecheck && npm run lint && npm test`. Add the new path to the list in
`e2e/public/auth-gate.spec.ts` (asserts 401 `UNAUTHORIZED` when signed out), then
`npm run build && npm run test:e2e`. Cover the happy path + 409/422 codes in `e2e/authed/` if it
mutates data (see the `e2e-testing` skill); confirm 403 wrong role and 404 cross-project id.
