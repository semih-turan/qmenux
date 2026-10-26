# Approved application, tenant provisioning and manual license boundary

Status: Proposed implementation contract only; owner Engineering, named architecture/security/privacy/legal reviewer and dated acceptance pending |2026-10-26

No implementation, migration, permission, route, credential or commercial approval is delivered by this document. Current code ends at the explicit pre-tenant application APPROVED decision in0022. This proposal defines the next independently testable local slices for T041, T010 and T042.

## Existing evidence and unresolved model differences

- [Application approval](OPERATOR_APPLICATION_REVIEW.md#explicit-application-approval-0022-verified-local-development) records a decision only; no tenant/member/license is created. Application APPROVED must never be interpreted as tenant ACTIVE.
- [TenantTransactions](../../apps/api/src/tenant-transactions.ts) resolves ACTIVE tenants only through0002 and requires trusted authorization before work. [TenantAuthorization](../../apps/api/src/tenant-authorization.ts) separately requires current membership/permission and a mandatory entitlement callback. A new APPROVED tenant cannot bootstrap itself through that ordinary resolver.
-0004 [membership triggers](../../infrastructure/database/migrations/0004_tenant_memberships.up.sql) revoke all normal sessions for the affected user on insertion/change, including a newly inserted PENDING membership. Preserve that security behavior and require honest reauthentication; do not keep an old admin cookie usable to simplify onboarding.
- Existing step-up supports tenant:approve/reject and license actions, but **not tenant:provision**. Reusing an approval proof for provisioning would collapse two distinct commands. A later additive operator migration/type/validation change and new current-transaction capability are required before provisioning can run; this proposal adds no action now.
- [Subscription spec](SUBSCRIPTION_BILLING.md) explicitly leaves business-versus-branch coverage open. Tenant-shaped subscription/license sketches in DOMAIN_MODEL/DATABASE are illustrative, not signed coverage approval. Their tenant_id cannot settle the commercial question. Current0013–0022 applicant/decision records also do not establish a merchant contract, billing identity or license acceptance.
- Initial tenant statuses in0001 include PENDING_APPROVAL/APPROVED/ACTIVE. Under the already implemented pre-tenant flow, a tenant would be created only after a recorded application approval plus separate provisioning confirmation, using APPROVED as the proposed inactive prepared state. Signup still creates no tenant. No existing state is reinterpreted or migrated by this document.

## Separate states and explicit commands

| Checkpoint | Persisted result proposed | Management/public authority |
|---|---|---|
| Registered identity | Existing REGISTERED user and admin session | Own application workflow only |
| Approved application | Existing immutable APPROVED decision | No tenant/member/license |
| Explicit provisioning | One linked tenant APPROVED, one initial branch, applicant OWNER/PENDING, audited result | No catalog access, publication or license |
| Separate initial license grant | Reviewed license interval/coverage, authorized tenant activation and initial OWNER activation in one transaction | Only current role + effective entitlement + all existing guards qualify |
| License no longer effective or administratively blocked | Preserved history and explicit policy result | Protected operations deny according to reviewed policy; no implicit grace |

These are separate state machines, not a browser-controlled linear status field. A future-dated grant cannot make a request entitled before its start; ACTIVE metadata alone is never sufficient. Public menu publication remains a separate explicit workflow with immutable revisions and legal/content validation. No menu/products/themes/food facts, DNS record, payment or notification is auto-created by provisioning.

## First implementation slice: inactive provisioning

Proposed server command: application UUID plus closed {revision,slug,businessName,initialBranchName,reason,requestId}. UUIDs, revision and single-line text follow current input rules; reason/request identify this provisioning operation, distinct from the approval request. Applicant UUID, OWNER role, tenant/branch IDs, statuses, actor, application approval evidence, proof action and digest are server-owned. No attach-to-existing-tenant, owner transfer, arbitrary user selector, requested-role or bulk/multi-branch command.

Use the canonical existing tenant slug validator/reserved-name set, normalized before command hashing, plus database uniqueness and an additive equivalent database constraint for this new writer.0001 does not exclude workspace/control although the server validator does: preserve old migrations and reject those names for new provisioning, never rewrite existing rows silently. Display names are not unique legal/business identities; no fuzzy dedup, merger or assumption that two applications are the same business. Review/appeal/duplicate-business policy remains open.

Proposed invariants: one application maps to at most one provisioned tenant; that tenant has one originating application and one initial branch for this command. A user may retain multiple independently authorized tenant memberships; this is not a subscription branch-count rule. Idempotency checks both verified operator/request and application mapping. Same exact successful command returns its immutable result after current operator authorization; changed command/request reuse409, application already provisioned by a different command409 without claiming new authority. Slug collision409 rolls back rather than attaching to somebody else's tenant; no availability endpoint may expose another tenant's private identity.

Required transaction sequence (application orchestration via module contracts only):
1. Verify signed Access, ACTIVE PLATFORM_ADMIN, current browser/session/CSRF/ordinary MFA and exact command. Check authenticated recorded-result replay first; no new proof is needed for an exact committed replay, but current authority remains mandatory.
2. For a new write, consume a fresh tenant:provision step-up on the application UUID and full normalized command digest. An ordinary MFA, approval, rejection, license or another browser/session proof cannot substitute.
3. Lock/validate the current APPROVED application at the expected revision through onboarding's explicit contract. Resolve its immutable applicant internally and verify current REGISTERED identity through an identity-owned contract. Rejected/pending/draft/stale/already linked/suspended cases must deny without side effects.
4. Create server-generated tenant/branch IDs and the APPROVED tenant/initial branch via tenancy's narrowly authorized bootstrap contract. Create only OWNER/PENDING via identity's contract. Record onboarding's immutable application→tenant/branch result and actual operator/reason/request/command audit in the same transaction.
5. Commit all effects and proof consumption together. Any audit/constraint/identity/membership/link failure rolls back everything; no orphan tenant/branch, new membership, consumed proof or success result survives. Existing session revocation triggers participate in that same transaction.

A consistent lock order and concurrent approved-application/slug/operator/user-suspension tests are prerequisites. Do not use a second pooled connection or process-local lease for any phase. No external HTTP/DNS/email/message side effect belongs inside runStepUp. No worker/broker/outbox is needed for this initial database-only slice.

## Module contracts and bootstrap authority

| Owner | Proposed contract responsibility | Forbidden shortcut |
|---|---|---|
| Operator | Current-transaction consumed provisioning actor/action/target/request/digest capability | Trusted GUC actor, historical CONSUMED row, ordinary platform:read or caller-supplied UUID |
| Onboarding | Lock current approved application, protected provisioning permit, immutable mapping/result replay | Caller-supplied applicant, mutable approval decision, cross-module direct table query |
| Tenancy | Create only the permitted tenant/initial branch in inactive state, enforce slug/mapping identity | Generic runtime INSERT, arbitrary tenant/status assignment or using ACTIVE resolver as bootstrap |
| Identity | Verify current registered applicant and create exactly permitted OWNER/PENDING with revocation | General role assignment or trusting a JavaScript receipt as database authority |
| Subscription (later) | Current covered entitlement and audited explicit grant lifecycle | Constant true entitlement, payment/browser redirect authority or direct foreign-table reads |

Names are conceptual responsibilities, not registered interfaces/endpoints. Proposed orchestration stays in the existing modular-monolith application layer; it calls module-owned contracts on one checked-out transaction. SQL receivers must revalidate a protected onboarding permit and the exact current-transaction operator capability, including generated mapping IDs; a copied digest, mutable JS object or runtime-executable helper alone cannot authorize insertion. Record/replay uniqueness must be enforced by the database, not only preflight checks. Application decisions remain unchanged; the provisioning mapping is separate history.

Use fixed-search-path definer contracts with explicit scope/authority predicates where pre-tenant bootstrap requires them; runtime remains NOSUPERUSER/NOBYPASSRLS and cannot write module tables directly. Do not relax existing tenant RLS, grant global table access or change role/GUC authority. Exact contracts/constraints require proposed ADR026 review and local atomic/ACL/isolation evidence before any production use.

## Second slice: separate manual license grant and entitlement

No license schema/grant mutation is selected until the coverage decision is recorded. Proposed initial grant command pins provisioned tenant/mapping revision, explicit reviewed coverage/policy version, explicit UTC startsAt/expiresAt, reason and request UUID. Server derives its distinct license:grant action/target/digest; operator cannot choose arbitrary user/role or cover a foreign branch. Application approval and successful provisioning are necessary but not sufficient. Price/payment status never substitutes for a license grant; no checkout/card/provider callback/automatic renewal is introduced in V1.

Recommended technical time semantics for review: valid interval startsAt <= database time < expiresAt, strict startsAt < expiresAt and no inferred annual/monthly term. Policy/grant revisions and exact timestamps are signed into the command; extension is an explicit replacement boundary, not an unreviewed add-days default. No grandfathered grace, future auto-activation job, daily expiry scheduler or revival of expired sessions is assumed. Coverage, renewal/overlap/future-start activation and grace/public-read behavior must be resolved before those operations are implemented.

For an effective initial grant, proposed grant record/audit, tenant activation and initial OWNER activation must commit through their owning modules together with exact step-up consumption. Future grants need a separately defined activation transition; they must never activate early. Account/tenant suspension and license suspension/revocation override entitlement. Current effective entitlement must be checked within the same tenant transaction, not cached as session truth. Failed/unavailable/unknown policy denies protected work. Preserve revocation triggers and require a new user session after membership changes; regrant never resurrects an old token. Cross-session races/cache boundaries need explicit tests before enablement.

Later extend/suspend/revoke use their existing separately reserved action purposes, current grant revision, explicit reason/request and immutable lifecycle audit. No silent unsuspend/regrant or history edits. License event history is distinct from approval/provisioning history; actor/request/policy/previous/new values must be attributable without auth secrets. Manual commercial payment recording/invoicing, if later required, stays a separate reviewed accounting workflow.

## Product decisions still open

| Decision | Current evidence | Consequence |
|---|---|---|
| Coverage: business or branch; included branch count | Subscription recommendation is tenant-level, not approved | Blocks final license schema/entitlement and grant; inactive single-initial-branch provisioning can be tested independently |
| Standard amount/currency/term and manual commercial procedure | One edition/price, actual amount/interval unresolved | No pricing promise, default term, invoice/payment record or charge |
| Grace, expiration, read-only management/public menu and suspension presentation | No signed rule | No inferred grace or guest-menu retention/removal policy; publication/real activation remain gated |
| Legal identity, contracts/notices/acceptance, retention and provider/data processing | Named legal/privacy review pending | No fabricated acceptance or real-user enablement |

This document recommends an implementation boundary, not approval of any open commercial/legal choice. A generic “next step” authorizes the bounded requested work; it does not supply missing policy answers.

## Mobile transport and uncertain results (later slice)

Reuse the isolated operator host/cookies/CSRF/machine-purpose separation, actual native ceremony and separate final confirmation. Display application/business/slug/initial branch/reason for provisioning; display exact coverage and time interval for a separate grant. Never label provisioning as activation, or an approved application as licensed. No parent-domain cookie, generic proxy, arbitrary action, tenant/user/role selector or public credentials.

A lost response keeps exact command/action/request/digest frozen. No automatic new request or second provisioning. Recorded-result lookup must use current verified actor and positive exact command/result matching; absence is not proof of failure. A retry after a successful membership insertion may require applicant reauthentication. Offline/timeout cannot report activation/revocation or clear uncertainty as success. Same-account operator reauthentication may retain in-memory intent; a verified account change clears private state. No new browser persistence or review-route enablement is implied.

## Required evidence before implementation is accepted

The following are **planned tests, not executed results**:
- T041-PROV-001: actual native step-up→local PostgreSQL provisions one inactive tenant/initial branch/OWNER-PENDING for the immutable approved applicant; zero license and zero catalog/public authority.
- T041-PROV-002: draft/pending/rejected/stale/foreign/altered applicant, suspended actor/applicant, missing/expired/wrong-action/session/browser/CSRF proof deny; direct runtime SQL/GUC/old transaction cannot forge a permit.
- T041-PROV-003: same command concurrency/replay returns one mapping; changed command/application/request or slug conflict denies without attaching to another tenant; injected failures at each module/audit boundary leave no partial effect.
- T041-PROV-004: current user-status race/lock ordering, tenant RLS and pool reuse; initial membership insert revokes all prior normal sessions, rollback restores them and later grants cannot revive them.
- T041-PROV-005: empty migration up/rollback/down/reapply/duplicate/unknown-version guards, populated data/history down refusal, runtime ACL/fixed paths/no direct table access; prior0022 decisions unchanged.
- T042-LIC-001: only separately proved and confirmed license grant with approved coverage/policy/interval permits activation; approval/provisioning/payment or tenant ACTIVE alone never grants entitlement.
- T042-LIC-002: start/end boundaries, future-start handling, policy/coverage/branch mismatch, concurrent grant/extension/revoke/expiry/suspension, atomic lifecycle audit, current transaction denial and no old-session revival.
- T042-LIC-003: actual protected API/BFF/mobile flows at320/375/390/430px; explicit two confirmations, complete review, keyboard/safe areas/44px targets, loading/empty/offline/conflict/cancel/uncertain replay/own recorded recovery; actual provider/device/hosted and named review separately required.

## Delivery order and rollback

1. This docs-only proposed contract/ADR and synchronized backlog/roadmap; no task DONE.
2. Separately requested local T041 inactive provisioning: new operator action/capability, minimal module contracts/migration and actual native/PG isolation/atomicity tests. No license or routes. Future task branch suggestion feat/T041-inactive-tenant-provisioning requires normal explicit Git authorization; no branch is created here.
3. Resolve coverage/commercial/policy questions; implement T010/T042 license persistence/entitlement and separately proved grant with local tests.
4. Add reviewed operator transport/mobile confirmation/result recovery and owner status projection, then verify actual provider/cloud/device/abuse/privacy/security/legal/restore gates before registering/enabling anything. Full T043 marketing stays last.

For a later migration, preserve0001–0022; use the next available migration version after checking current history. Down must lock affected data, reject later schemas and refuse populated mappings/grants/audit rather than delete or relink history. Disable/remove callers before a reviewed rollback or forward correction. Migration tests must prove existing identities/approval decisions/published revisions survive. Do not silently deactivate a real business, undo a legal record or delete its tenant/history as a rollback shortcut; use reviewed operational recovery. This current docs-only change has no runtime/data rollback.
