# T002 initial tenant/catalog schema

SQL-first, ORM-neutral development migration: five business tables plus a private migration ledger. This is the first bounded product slice, not the complete V1 database. No package, ORM, personal-data seed, legal rule or billing default is introduced.

## Scope and boundaries

`qmenux.tenants` → `branches` → `menus` → `categories` → `products` use UUIDs, timestamptz audit fields, ordered catalog indexes and composite tenant-scoped foreign keys. Prices are nonnegative PostgreSQL integer TRY minor units. Slugs are lowercase ASCII DNS labels (max 63 characters), excluding punycode and current reserved hosts. Names cannot be whitespace-only.

Tenants default to PENDING_APPROVAL. Runtime can read only its tenant row and cannot create/activate/delete tenants. Menus remain draft-only until immutable revisions, privileged publication and entitlement checks exist; runtime cannot set menu state. Product availability is AVAILABLE/SOLD_OUT/HIDDEN independently of publication. No public menu or automatic license/activation path is implemented.

All business tables use ENABLE and FORCE RLS with transaction-local `app.tenant_id`. Missing/empty context exposes no rows; malformed UUID context errors closed. Migration owner and runtime are separate. Up refuses elevated runtime flags/parent memberships and execution as runtime. Grants exclude schema DDL, TRUNCATE, tenant writes and migration-ledger access.

RLS isolates tenants; it does not authenticate principals or check membership/approval/license. T003/T004/T040–T042 must enforce those checks before a server transaction sets context. The internal T003 transaction boundary now uses a narrow tenancy candidate lookup; no business controller is registered. Identity, media, approved allergen/nutrition provenance, licenses and immutable revisions are added in later task-scoped migrations.

## Apply and rollback

Use an independently verified **direct migration-owner connection**, never the pooled runtime URL. Keep credentials in PostgreSQL service/password files outside Git with mode 0600, not command arguments. Example with a preconfigured development-only service:

```sh
PGSERVICE=qmenux-dev-owner psql -X --single-transaction -v ON_ERROR_STOP=1 \
  -f infrastructure/database/migrations/0001_tenant_catalog.up.sql
PGSERVICE=qmenux-dev-owner psql -X --single-transaction -v ON_ERROR_STOP=1 \
  -f infrastructure/database/migrations/0001_tenant_catalog.down.sql
```

Verify project `icy-tooth-77695631`, branch `qmenux-dev`/`br-crimson-sky-b8i9xve7`, database `neondb` and its direct endpoint before connecting; SQL cannot attest provider branch identity. Always execute the whole file atomically with ON_ERROR_STOP. Up uses advisory/lock/statement limits and refuses an existing schema. Do not drop objects to bypass this. Applied files are immutable; add new numbered forward migrations. The ledger records version/time; a general checksum/reconciliation engine is deliberately not added.

Down is **empty-development rollback only**: lock business tables, refuse any business rows/later version, use row_security=off so hidden rows cannot appear empty, and drop only known tables/the empty schema without CASCADE. Data-bearing/production rollback requires reviewed forward correction and backup/restore procedures. Future changes follow expand/backfill/switch/contract.

## Tests

```sh
bash -n infrastructure/database/test-local.sh
bash infrastructure/database/test-local.sh
```

Requires Bash, standard grep and local PostgreSQL tools (tested 17.11). The script creates a private socket-only disposable cluster, never accepts a remote URL, and removes/stops its cluster on exit/signals. Private socket trust is a test-only pattern. Non-superuser migration owner and separate restricted non-owner runtime reproduce Neon role boundaries; synthetic data tests always roll back.

Assertions cover forced RLS/ownership, pending/draft defaults, all reserved names, slug format/uniqueness, composite FK isolation at every parent, missing/invalid context, both tenant contexts, foreign-row/write denial, own CRUD, field checks and forbidden activation/publication/DDL/TRUNCATE/ledger access. Negative controls reject elevated runtime and disabled RLS. Migration tests reject duplicate up, preserve data when down is refused, reject later versions/RLS-hidden-data rollback, and verify empty down/reapply.

The same up/invariant/down/reapply checks passed on Neon PostgreSQL 18.6 through the verified development direct connection. Six tables remain, with **zero business rows**; T003 subsequently added ledger version 0002. Existing API readiness stayed 200/no-store. T003 pooled application-schema and hostname tests now pass; identity/license checks remain later gates; no task DONE or launch/ORM approval inferred.

Sources checked 2026-10-25: [PostgreSQL constraints](https://www.postgresql.org/docs/18/ddl-constraints.html), [RLS](https://www.postgresql.org/docs/18/ddl-rowsecurity.html), [psql atomic execution](https://www.postgresql.org/docs/18/app-psql.html). [Task evidence](../../docs/01-product/PROGRESS.md#t002-initial-tenantcatalog-schema--2026-10-25).

## T003 resolver migration and integrated tests
The baseline originated in sibling `qmenux-t002` at main 111542c. This dependent T003 branch starts at 467f1e2 by owner authorization and copies baseline SQL/tests unchanged; sibling worktree is untouched. Root tooling is now available. Root `pnpm test` includes a real private-cluster PostgreSQL/HTTP integration test, without cloud credentials. CI adds PostgreSQL tools to PATH; this diff has not run in hosted CI.

Apply `migrations/0002_tenant_resolution.up.sql` after 0001 using the same direct-owner atomic psql command above. It expects exactly baseline version 0001. Roll back 0002 first with `0002_tenant_resolution.down.sql`, then 0001 only if empty. No CASCADE, data deletion or baseline rewrite. Stop dependent callers before rollback. Up/down require the entire file in one transaction.

0002 adds a fixed-search-path, fully qualified SECURITY DEFINER lookup returning only an ACTIVE candidate UUID. PUBLIC execution is revoked; runtime-only execution is granted. This bootstrap is not identity/entitlement authorization. API requires an explicit trusted server policy before any business work. Local integration tests cover privileges, rollback/reapply and cross-tenant HTTP/RLS behavior; manual `test:tenant-neon` uses the same production service and removes synthetic fixtures afterward. Never execute `t003-fixture.sql` outside an isolated empty development database. [Evidence](../../docs/01-product/PROGRESS.md#t003-tenant-resolution-and-transaction-isolation--2026-10-25).

## T004 identity migration
Apply `0003_identity_sessions.up.sql` atomically through the direct migration owner after 0001/0002. It adds four global identity-owned tables and five restricted functions; it does not grant tenant roles/licenses or change tenant RLS. State/browser/session tokens are hashed, and the short-lived PKCE verifier/nonce is private to the identity module. User identity is keyed by Google's issuer+subject, never email. All runtime table access and PUBLIC function execution are revoked.

`0003_identity_sessions.down.sql` requires exactly versions 0001–0003 and empty identity tables under exclusive locks; it drops known objects without CASCADE and refuses all data-bearing rollback. Disable/remove callers first. Never delete real identities to satisfy rollback. Local tests verify rollback/up/down/reapply, data-bearing refusal, fixed search paths and grants. Manual `test:identity-neon` verifies the actual store and removes all synthetic rows, retaining version 0003. Provider auth remains disabled; retention/abuse protection, identity/RBAC/MFA and legal review remain open.

## T004 membership migration
Apply 0004_tenant_memberships.up.sql atomically through the verified direct owner after exactly 0001–0003. It creates an empty identity-owned tenant membership table (OWNER/EDITOR, PENDING default), forced tenant RLS, no runtime table grants, and one runtime-executable fixed-path membership/session read function with explicit tenant filtering. A separate trigger-only function revokes sessions on membership changes and user-status updates; PUBLIC/runtime cannot call the trigger function directly. No tenant/user activation/license grants or seeds.

Down requires exactly 0001–0004, locks membership rows and refuses any membership data (row_security=off prevents a hidden-data false empty). It removes only the known triggers/function/table and ledger entry, with no CASCADE or data deletion. Disable dependent callers first; data-bearing changes need reviewed forward correction. Earlier migration files are immutable and are not rewritten. Local and manual Neon tests exercise atomic rollback, down/reapply, refusal with data and authorization boundaries. See TASKS/PROGRESS for actual run status; task/reviewer approval remains separate.

## T004 separate operator records (0005)
Apply 0005 atomically with the direct migration owner after 0001–0004, only on the isolated development branch for this slice. It creates empty global operator/security records, not tenant-scoped business tables, and grants runtime only create/read/revoke session contracts with fixed search paths. No operator, role activation or real session is seeded. Registered Google identities and tenant members gain no platform role.

The API's internal OperatorAuthorization requires signed Access, a separately supplied trusted server MFA policy and a current provisioned operator/session. There is no production MFA adapter or HTTP caller. Only platform:read is recognized; no business write/approval/license access. Runtime table privileges and tenant RLS remain unchanged. Operator updates revoke sessions; session hashes bind to the exact Access audience and expire after fifteen minutes.

Disable/remove callers before 0005 down; it refuses operator/session data and unexpected later versions. Never delete records to bypass the guard. Local integration tests cover atomic rollback/up/down/reapply, duplicate refusal, protected data-bearing down, signed-identity/MFA-policy/session boundaries and pool reuse. Manual isolated Neon execution is `pnpm --dir infrastructure/spikes/orm test:operator-neon`; see the progress record for actual results. No real-user MFA or launch readiness is implied.

## T004 bounded expired credential cleanup (0006)
Apply0006 atomically through the direct owner after0001–0005 on the isolated development branch. It adds three expiry/hash indexes and two restricted module contracts: identity cleanup (up to100 attempts plus100 sessions) and operator cleanup (up to100 sessions). Selection uses existing expiry only and skips locked rows. No principals, memberships, licenses or tenant records are deleted; runtime table permissions remain unchanged.

Build the API, then run `pnpm --dir infrastructure/spikes/orm maintenance:auth-expiry` for one explicit development sweep using only the restricted pooled runtime URL. Results contain counts only; the pool lifecycle helper may also emit a generic status line. Repeat manually for a backlog; no automatic scheduling or retention SLA is implemented. The endpoint allowlist is the known qmenux-dev branch; real production use requires separate reviewed configuration/retention work. No maintenance HTTP route exists.

`test:auth-expiry-neon` applies/rolls back0006 and exercises synthetic batch limits, live-record preservation, exact expiry, locks/overlap, transaction rollback, function privileges, safe populated down/reapply and complete fixture cleanup. Down drops only new functions/indexes; remove callers first, reject later versions and never restore/reissue deleted expired credentials. Existing0001–0005 files are preserved. See PROGRESS for actual results; this is not legal retention approval.

## T004 Microsoft provider-bound persistence (0007)
Atomic0007 up/down extends only qmenux_identity. Three fixed-issuer EXECUTE-only Microsoft contracts preserve issuer+subject isolation and browser-bound one-use attempts. Existing Google rows/defaults/signatures are compatible; no seed/operator/tenant/license approval. Old0001–0006 files are unchanged. Down rejects later versions and any Microsoft identities/attempts; it locks identity/attempt tables before the data guard, preserving Google rows and refusing to delete data for rollback.

After `pnpm --filter @qmenux/api build`, run the development-only `pnpm --dir infrastructure/spikes/orm test:microsoft-identity-neon`. It verifies existing exact development endpoint/roles/TLS, empty business/security tables and known0006/0007 versions before writes; then performs shared local/Neon isolation, migration rollback, duplicate-up, live-data down refusal, concurrency, suspension/revocation, grants and synthetic cleanup tests.0007 is retained; no production/main branch migration. Existing probes explicitly recognize ordered0007; expiry fixture tests refusal to down0006 through0007. No unknown version is silently accepted. Runtime DB-only CLI/cron behavior remains; see progress for actual run evidence.

## T004 Apple nonce-only persistence (0008)
Atomic0008 up/down extends only qmenux_identity for the owner-selected Apple confidential nonce development profile. Three fixed-issuer EXECUTE-only contracts and store methods reuse existing tables/session lifecycle/cleanup. A table check requires verifierNULL for Apple and non-NULL/valid for Google/Microsoft; no fake PKCE field. Exact issuer+subject namespaces, browser-bound one-use nonce and no automatic tenant/license/operator activation.

After API build, `pnpm --dir infrastructure/spikes/orm test:apple-identity-neon` verifies exact existing development endpoint/roles/TLS, empty security/business tables and known0007/0008 versions before writes. Shared local/Neon fixture tests up/rollback/duplicate guard/down/reapply, Apple-populated down refusal, three-provider isolation, existing PKCE requirements, concurrency/session revocation/expiry/grants and synthetic cleanup.0008 retained, main DB untouched. Down locks provider tables and refuses Apple identity/attempt data; it preserves Google/Microsoft rows and restores prior constraints.0001–0007 files unchanged. Earlier probes allow only known ordered0008; Microsoft probe does not try to down0007 through it. See actual progress evidence, not an inferred release approval.

## T004 API/admin audience persistence (0009)
0009 adds explicit app audience to attempts/sessions and a required admin-only csrf_hash. Twelve legacy API contracts are pinned to api; five admin contracts are EXECUTE-only and share provider identity locks. API/admin state, read, rotation, revoke and legacy membership lookup cannot cross audiences. No BFF client authentication/browser endpoint/key is introduced. Existing100/table cleanup and user/membership revocation cover both audiences; no new table/service.

After API build: `pnpm --dir infrastructure/spikes/orm test:admin-audience-neon` requires exact isolated dev endpoint/roles/TLS, empty business/security tables and ordered0008/0009 before writes. Shared fixture tests atomic up/rollback/down/reapply, data/version refusal, audience/issuer/browser/replay separation, CSRF, concurrent API/admin identity creation, synthetic membership/RLS, status/membership revocation, grants and fixture cleanup;0009 retained. Down locks tables/refuses all admin attempts/sessions, preserving API rows; no forced data deletion.0001–0008 unchanged. Earlier probe allowlists recognize ordered0009 only; Apple fixture asserts0008 rollback refuses later0009 and preserves it. Actual evidence is in PROGRESS, no main DB/release approval implied.

## T005 draft product events (0010; local development only)

0010 adds positive product revisions and forced-RLS append-only old/new/actor audit, with a trigger that requires authorized server-set transaction-local tenant/actor context. Runtime has no event writes/direct trigger execution or product DELETE. Same-revision concurrent edits conflict; failed transactions roll back both data and audit. Existing products are preserved at revision1 with no invented pre-migration history.

Local root API tests exercise atomic up/rollback/down/reapply, duplicate/later-version/data-bearing guards, exact row preservation and the real DraftCatalog service under restricted runtime/RLS. Down locks products/events and refuses all history/advanced revisions; remove callers first, never delete history to force rollback. Earlier migrations are unchanged. The new fixture is disposable-local-only; no remote0010 application is authorized or performed. Manual Neon probes intentionally recognize only schemas through0009 and must not have their old destructive synthetic cleanup applied to immutable0010 history. [Detailed contract](../../docs/04-backend/DRAFT_CATALOG_CONTRACT.md).

## T004 admin tenant membership (0011; local development only)

0011 adds one runtime-EXECUTE-only identity-owned fixed-admin membership/session function with explicit current tenant, current user/membership and optional exact session CSRF hash. Application authorization requires the proof on admin mutations, preserves API-only legacy lookups and never defaults entitlement true. No data, role/table privilege or business HTTP route is created.0011 down removes only the function/ledger entry after removing callers and rejects later versions; local tests verify populated down/reapply with immutable0010 history preserved. No cloud migration or manual probe expansion is performed.

## T005 draft menu/category structure (0012; local development only)

0012 adds positive revisions and separate forced-RLS/FK-bound menu/category audit tables. A closed-target catalog trigger records old/new/actor/UTC state, no-op edits preserve revisions, and runtime cannot mutate events or DELETE menus/categories. Existing rows are preserved with no invented older history; product history is unchanged. Local fixtures verify the full draft hierarchy, actor/CSRF/isolation/concurrency, atomic FK/transaction rollback and migration preservation/refusal. Down locks the entities/events and refuses any history/advanced revision or later schema; never delete audit to force rollback.0001–0011 and remote/manual probe scope remain unchanged. [Detailed contract](../../docs/04-backend/DRAFT_CATALOG_CONTRACT.md#draft-menus-and-categories-0012--2026-10-26).

## T041 pre-tenant applications (0013; local development only)

0013 adds an identity-owned bound-admin-session proof function and a separate onboarding-owned private schema with DRAFT/PENDING_APPROVAL applications/events, EXECUTE-only current-applicant contracts, default-deny forced RLS and append-only audit. No tenant/member/license or approval is created. New actor context is transaction-local and rejected if dirty on pool checkout. Original/current names bind idempotent create through later edits; submit/edit are row-locked and preserve revision/audit consistency.

Disposable tests cover migration atomic rollback/down/reapply/data/version refusal, actual user/audience/proof isolation, concurrency/retries/state/audit/pool lifecycle and unchanged tenant/member state. Populated down refuses all data; never delete applications/history for rollback. No cloud migration, real applicant or prior-schema edit. [Contract and privacy/release gates](../../docs/04-backend/ONBOARDING_APPLICATION_CONTRACT.md).


## T004 operator passkeys (0014; local development only)

0014 adds operator-owned forced-RLS grant/key/challenge/proof/event tables and EXECUTE-only contracts. A separately provisioned grant is required for enrollment; no operator/grant/key is seeded. Browser-bound one-use challenges, counter-checked verification, five-minute proofs and irreversible key revocation compose with existing Access/platform sessions without tenant bypass. Down locks all tables with row_security=off and refuses any data/later schema; never delete credentials/history for rollback. Local real PostgreSQL/native Chromium fixture covers protocol/session/isolation/audit/concurrency and version/rollback boundaries. Install pinned Chromium before API tests (`pnpm exec playwright install chromium`); root CI already does this. Existing remote/manual probes remain guarded at0009. [Full contract and remaining enablement gates](../../docs/04-backend/OPERATOR_PASSKEY_CONTRACT.md).


0016 (local only) adds operator browser-session CSRF hash binding and three explicit EXECUTE contracts. Legacy/browser lookups and logout cannot substitute; populated bound-session down is refused. Existing session revocation/expiry applies unchanged. Earlier migrations and cloud/manual-probe scope are unchanged; see the operator passkey contract for full transport/review limitations.


## Operator challenge restart (0017; local development)

Function-only0017 replaces passkey_begin so a new authorized start retires only expired own challenges and the same operator/application/browser/purpose's pending challenge. Other browsers and purposes retain the total cap of five. Old nonces cannot finish; grants/credentials/audit are unchanged. Populated up/down/reapply and replacement/replay/isolation/cap regressions run against disposable PostgreSQL. Down restores future-start behavior without resurrecting nonces or deleting historical credentials. Earlier migrations and remote/manual Neon probe guards at0009 remain unchanged; no cloud migration was applied.


## Operator session audit (0018; local development)

0018 adds random session audit UUIDs and a private forced-RLS append-only session_events table. Atomic insert/delete triggers record ISSUED/RETIRED; preexisting sessions receive OBSERVED baseline only. Events contain affected operator/application/expiry/time, no tokens/hashes or guessed human revoker/reason. Runtime has no direct table/function helper privilege. History and session audit identities are immutable; no unaudited TRUNCATE. Audit failure rolls back the session transition. Down locks tables with row_security=off and refuses any sessions/history; never delete retained events to force rollback. Earlier migrations/manual Neon guard0009 are unchanged; local PostgreSQL tests only, no cloud migration. Full semantics and privacy/recovery/retention limits are in OPERATOR_PASSKEY_CONTRACT.md.


## Operator operation-bound step-up (0019; local development)

0019 adds private forced-RLS challenge/proof/event records for a separate native passkey ceremony bound to current browser session/CSRF/MFA and exact operation digest. Proof use, audit and protected database callback are atomic; session/MFA replacement or revocation cascades pending evidence. Runtime receives four fixed-path EXECUTE contracts only; audit is append-only, with no raw command or reusable auth material. Up requires0001–0018; locked row_security=off down refuses any data/history. Older migrations/manual Neon guards remain unchanged; only disposable local tests apply0019. See OPERATOR_STEP_UP_CONTRACT.md for server command hashing, two-minute limits, domain/transport/recovery/retention gates and no-external-side-effect callback rule.


## Pending application rejection (0020; local development)

0020 adds REJECTED/reviewer/reason/request/timestamp consistency and APPLICANT/OPERATOR audit kinds to onboarding. Three explicit onboarding EXECUTE contracts list pending/replay/reject using operator-owned session/current-transaction rejection capability functions. A private canonical digest helper binds revision/reason. Future step-up audit rows receive transaction IDs; historical rows remain NULL. No cross-module direct table query or new runtime table grants. Down locks and refuses any review history or new transaction metadata rather than losing evidence. Earlier migrations/manual Neon guards remain unchanged; local tests only, no cloud migration. See OPERATOR_APPLICATION_REVIEW.md for authority, idempotency and remaining release gates.


## Own recorded decisions (0021; local development)

0021 adds an onboarding-owned EXECUTE-only list_rejections read contract and a partial reviewed_by/reviewed_at/id index. Existing operator review_session authenticates the actor; only their immutable recorded decisions are projected. Keyset cursor uses the own anchor row's exact timestamp/ID, with foreign/unknown cursor indistinguishably empty. No new data, GUC, direct runtime table privilege or write contract. Safe populated down removes function/index only, preserving all decisions/audit; earlier migrations/manual Neon guards unchanged. Local PostgreSQL only; no cloud migration. See OPERATOR_APPLICATION_REVIEW.md for five-record browser limits, private projection and remaining release/recovery gates.
