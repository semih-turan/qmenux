# Draft product catalog development contract

Status: Implemented local development slice; architecture/security/legal and named reviewer acceptance pending | 2026-10-26

## Authority and scope

`DraftCatalog` is an internal Nest provider, with no registered product controller, browser BFF product route or public-read endpoint. Every method uses `TenantAuthorization` on one checked-out transaction: canonical tenant host resolution, current API-audience session/user/OWNER-or-EDITOR membership, server-selected catalog permission, mandatory server-supplied entitlement policy, then tenant RLS and work. There is no default license policy. Test-only `true` policies are never wired into AppModule controllers. Admin-audience tenant selection/membership and actual license entitlement remain separate prerequisites to exposing this service to the admin screen.

The current service owns product reads/creates/edits and product-event history, touching only catalog tables. Actor UUID comes from the authorization result; there is no actor/user/tenant/role input. It does not query identity tables or add cross-module SQL access. No sign-in, tenant approval, license, platform role, verified food claim or published revision is created by catalog work. Existing menus remain database-constrained to DRAFT. Media/ingredients/allergen verification/publication/category-management/mobile product UI remain unfinished parts of T005/T006 and later tasks.

## Use-case inputs and results

| Method | Input after trusted host/session | Result |
|---|---|---|
| list | `{categoryId?, after?, limit?}` | `{items, nextCursor}`; stable ascending product UUID cursor, default20/max100; includes all administrative availability states |
| read | Product UUID | Own product or404 |
| create | `{categoryId,name,priceMinor,description?,availability?,sortOrder?}` | Server-created UUID/revision1, TRY currency; default empty description/AVAILABLE/order0 |
| update | Product UUID plus `{revision,...changedFields}` | Updated product; matching revision required, stale409, missing/other-tenant404 |
| history | Product UUID plus `{afterRevision?,limit?}` | Ascending immutable revisions, `{items,nextRevision}`, default20/max100 |

Product results contain id/categoryId/name/description/priceMinor/currency/availability/sortOrder/revision only. History contains revision/actorId/occurredAt/previous/current. Audit snapshots use database column names, with timestamp serialization pinned to UTC; timestamps are instants, not browser-supplied authority. There is no cached response or automatic retry at this application boundary. A future HTTP adapter must apply private no-store/CSRF/auth/body limits and response schemas itself.

All input is validated as plain object/closed keys. UUIDs are validated, no coercion of string prices, nonnegative integers fit PostgreSQL int32, currency is server-fixed TRY. Required name is trimmed/nonempty/max200 UTF-16 code units; description max2000, optional line breaks/tabs; controls/NUL/DEL are rejected. These are bounded development input limits, not an approved food/commercial policy. Availability is exactly AVAILABLE/SOLD_OUT/HIDDEN; order is a nonnegative int32. Unknown actor/tenant/currency/calorie/allergen/publish fields are rejected. Query limits and revision values are validated. A foreign category has the same404 behavior as a missing one. SQL is parameterized.

## Migration0010 and audit invariants

`0010_draft_product_events` adds positive product revision and a forced-RLS `qmenux.product_events` table keyed by tenant/product/revision. Existing product data is preserved at revision1; historical edits before0010 cannot be reconstructed and no actor/history is fabricated. The first later mutation captures the existing row as `previous`. All later insert/edit changes, including price and availability, are recorded atomically with old/new values, actor and time. An unchanged edit does not advance revision or insert a redundant event. Matching-revision UPDATE prevents lost edits under concurrency.

A catalog-owned fixed-search-path definer trigger requires transaction-local tenant and actor context, prevents changing product identity and writes the event with the actual product revision. Only the already authorized application service sets the actor context. Runtime database credentials themselves remain a trusted server capability, not an end-user proof; a compromised runtime credential is outside the protection offered by custom PostgreSQL settings. `Database.begin` rejects dirty actor context as well as dirty tenant context and destroys that connection. Commit/rollback clears local context. Actor UUID is an opaque audit reference, with no direct identity-table foreign query.

Runtime can only SELECT history under tenant RLS, cannot invoke the trigger function or insert/change/delete events. UPDATE/DELETE/TRUNCATE history are also rejected by an append-only trigger. Product DELETE privilege is revoked; product FK/history is retained. Destructive deletion/archive policy is not invented here. Database administrators can alter schema/triggers; append-only application controls are not a claim of tamper-proof storage against a database administrator.

Direct-owner up requires exactly0001–0009, transaction/advisory/DDL locks and bounded SQL deadlines. Down requires exactly0001–0010, locks products/history and refuses any event or advanced revision. It preserves original products and removes only unused new schema metadata; never delete history to force rollback. A data-bearing installation needs a reviewed forward correction.0001–0009 are immutable.

## Tests, compatibility and release gates

`apps/api/test/draft-catalog-fixture.ts` runs only inside the existing disposable private local PostgreSQL cluster, after the signed-provider/identity fixtures. It verifies migration atomic rollback/down/reapply/duplicate/later-version/data guards and exact product preservation; strict validation; authorization/missing entitlement/cross-tenant denial; minor-unit boundaries; create/read/list/history/availability; no-op edits; concurrent stale-revision rejection; old/new actor-price evidence; failed transaction/FK audit rollback; append-only privileges/RLS; alternating tenants and dirty actor pool disposal.

Existing manual Neon probe allowlists intentionally stop at0009: do not silently extend them or run their legacy fixture cleanup against immutable0010 history. No cloud migration, owner/runtime credential access, real provider/tenant data, production deployment or real-user enablement is part of this delivery. Local test cluster teardown removes its entirely synthetic database, not selected historical records from a real installation. Hosted/Neon/physical mobile/real-provider/legal/reviewer evidence remains open. This is not T005 or T025 DONE, nor CT-002/CT-017 full acceptance or a menu-publication/legal-compliance guarantee.

Next dependencies are admin-audience tenant authorization, reviewed license/activation boundary and catalog controller contracts, remaining category/media/ingredient verification plus mobile product UI, then immutable publication/public menu/cache behavior. Marketing stays last; V1 payments stay absent.
