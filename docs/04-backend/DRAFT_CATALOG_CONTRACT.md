# Draft catalog development contract

Status: Implemented local development slice; architecture/security/legal and named reviewer acceptance pending | 2026-10-26

## Authority and scope

`DraftCatalog` is an internal Nest provider, with no registered product controller, browser BFF product route or public-read endpoint. Every method uses `TenantAuthorization` on one checked-out transaction: canonical tenant host resolution, current audience-bound session/user/OWNER-or-EDITOR membership, server-selected catalog permission, mandatory server-supplied entitlement policy, then tenant RLS and work. There is no default license policy. Test-only `true` policies are never wired into AppModule controllers. API audience remains the default. A subsequent0011 development contract adds an explicit authenticated-server admin context and session-bound CSRF on mutations; actual browser tenant-selection/HTTP adapters and license entitlement remain prerequisites to exposing catalog operations to the admin screen.

The current service owns product reads/creates/edits and product-event history, touching only catalog tables. Actor UUID comes from the authorization result; there is no actor/user/tenant/role input. It does not query identity tables or add cross-module SQL access. No sign-in, tenant approval, license, platform role, verified food claim or published revision is created by catalog work. Existing menus remain database-constrained to DRAFT. Media/ingredients/allergen verification/publication/mobile product UI remain unfinished parts of T005/T006 and later tasks.

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

Admin-audience authorization and draft menu/category operations are implemented in the later development sections below. Next dependencies are the reviewed license/activation boundary, catalog HTTP contracts, remaining media/ingredient verification and mobile product UI, then immutable publication/public menu/cache behavior. Marketing stays last; V1 payments stay absent.

## Admin audience extension (0011) — 2026-10-26

All methods accept only an additional **server-owned** app context (`api` default or `admin`) and optional CSRF proof, separate from their closed business input. TenantAuthorization rejects unknown apps, API+CSRF mixing, API/admin token confusion and missing/invalid CSRF for every admin capability except `catalog:read`. A supplied proof is checked even for reads.0011's identity-owned fixed-admin membership function binds the optional hashed proof to the exact current admin session and current tenant/user/membership; no fallback to API/operator sessions. No catalog input key can select app, actor or CSRF.

The BFF's exact-Origin and cookie/header matching remain transport requirements; the application now also verifies the secret's database session binding before a catalog write. Actual license policy is still mandatory and no catalog HTTP controller is registered. Tests exercise admin create/edit/history with actual0010 audit, wrong/missing/other-session proof, issuer namespaces, both app directions, membership revocation, expiry, role differences, pool reuse and safe0011 down/reapply without changing identity/catalog data.0010 and earlier migrations are unchanged by0011.

## Draft menus and categories (0012) — 2026-10-26

`DraftStructure` supplies create/read/list/edit/history for two concrete catalog entities. Its closed server-owned kind is exactly menu/category; static metadata chooses the corresponding table/projection. Neither a request field nor an arbitrary table name can select SQL. Existing product UUID/integer/text/closed-object validation is moved unchanged to `catalog-input.ts` and reused by both services. Both services retain mandatory current membership/entitlement and admin mutation CSRF on the same checked-out transaction.

| Entity | Create input | Edit input | Projection |
|---|---|---|---|
| Menu | `{branchId,name}` | `{revision,name}` | id/branchId/name/state:DRAFT/revision |
| Category | `{menuId,name,sortOrder?}` | `{revision,name?,sortOrder?}` | id/menuId/name/sortOrder/revision |

Edit must contain a change besides revision. Names use the existing nonempty/trimmed/max200/control-character rules. Category order is nonnegative int32/default0. Create IDs/revisions/state are server-owned. Unknown actor/tenant/state/reparenting/publication fields are rejected. Creation uses existing composite parent FKs; missing/foreign parents return the same404 and roll back any provisional audit entry. Catalog code does not query the tenancy-owned branch table directly. No branch provisioning, deletion, reparenting or publication operation is introduced.

Lists accept the entity's parent key plus optional after UUID/limit(default20,max100), ordered by immutable UUID for stable cursors. A foreign/missing parent used only as a filter returns an empty list; it never establishes authority or exposes the parent. Read/edit/history of missing/foreign entities return404. History uses afterRevision/default0 and limit20/max100. No-op edits retain revision/history; concurrent matching-revision edits admit one winner and return409 to the stale editor.

0012 adds positive menu/category revisions and separate catalog-owned menu_events/category_events, each with tenant/entity/revision PK, deferred same-tenant entity FK, actor/time/previous/current, forced RLS and runtime SELECT only. A closed-table fixed-search-path/UTC definer trigger records actual insert/edit state atomically using existing server-resolved actor context; entity/tenant identity cannot change. History UPDATE/DELETE/TRUNCATE is rejected, menu/category DELETE privileges are revoked. Existing data remains at revision1 with no fabricated pre-migration history.0010 product history remains unchanged.

Up requires exactly0001–0011; down requires0001–0012, locks entities/history, and refuses any events or advanced revision. It preserves existing menus/categories/products and removes only unused new metadata when permitted. Never delete history to force rollback. Existing manual Neon probes remain guarded at0009 and are not run against these immutable histories.

The local-only structure fixture verifies atomic rollback/down/reapply/version/data guards and exact preservation; the branch-fixture→menu→category→product path; closed inputs/kinds, missing entitlement/CSRF, cross-tenant parent/resource/cursor behavior, simultaneous edits/no-ops/history/order, both-entity transaction rollback, FK failure rollback, immutable/RLS/ACL boundaries and legacy baseline capture. This remains an internal development implementation, with no public/business controller, cloud migration, licensed activation or full T005/CT/mobile/reviewer acceptance.
