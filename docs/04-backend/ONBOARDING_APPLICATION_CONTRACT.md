# Pre-tenant application development contract

Status: Internal local implementation; named architecture/security/privacy/legal review and actual enablement pending | 2026-10-26

## Scope and authority

`OnboardingApplications` provides the user-owned draft→pending-review workflow. The initial0013 slice is an internal Nest provider; the later dedicated HTTP adapter is documented below. Browser form/routes and real-provider setup are not enabled by that initial slice. Only an unexpired admin-audience session for a current REGISTERED user qualifies. Reads use the existing identity-owned `read_admin_session`; create/edit/submit additionally use the new identity-owned `bound_admin_session(session_hash,csrf_hash)` contract. Both hash inputs are derived server-side from43-character opaque secrets; no applicant/user/tenant/role comes from business input. API/operator credentials and another same-user session's CSRF cannot substitute.

No membership or license is needed to apply. This exception supplies **application access only**: no tenant/branch is created, no approval/role/membership/license is granted, and catalog authorization still denies an applicant with no membership. Business license coverage/price/term/grace and privileged approval criteria remain unresolved independently of this pre-tenant workflow. Login itself still creates only the identity; an applicant explicitly supplies a display name before a draft is persisted. Submission is an explicit action, not signup activation or legal contract acceptance.

## Internal use cases

| Method | Input | Result |
|---|---|---|
| list | Admin session, `{after?,limit?}` | Own items and nextCursor; UUID order, default20/max100 |
| create | Admin session + bound CSRF, `{name,idempotencyKey}` | DRAFT revision1; UUID and createdAt server-owned |
| edit | Admin session + bound CSRF, application UUID, `{name,revision}` | Own DRAFT only; stale/submitted409; missing/foreign404 |
| submit | Admin session + bound CSRF, application UUID, `{revision}` | Own DRAFT→PENDING_APPROVAL; repeated submission returns existing result |

Projection is id/requestedName/status/revision/createdAt/submittedAt only. Applicant IDs, idempotency bookkeeping and session/CSRF hashes are not returned. Unknown tenant/actor/role/status/license fields are rejected. Name is trimmed/nonempty/max200 UTF-16 code units with existing control-character validation; this is a proposed business display name, not verified legal identity. Revision is positive int32; UUIDs, cursor and page limits are closed/validated with no coercion. Shared pure request validators were renamed from catalog-input to request-input and reused unchanged.

Create idempotency is scoped to the authenticated applicant and UUID key, serialized by a bounded transactional advisory lock plus a unique constraint. Same original payload returns the same application even after edits/submission; different original payload with the same key409. `initial_name` is retained privately to bind creation retries after `requested_name` changes. No business-name deduplication/approval policy is invented: distinct keys can represent distinct applications. Abuse limits and actual duplicate-business review remain release work.

Edit/submit lock the authenticated applicant's row. Matching-revision edits reject lost updates; no-op edits preserve revision/history. Submit sets a server timestamp and increments revision once; retries of that action return the already pending result without a duplicate event. Submitted names/identity are immutable in this development model. Only DRAFT/PENDING_APPROVAL are database-valid; approval/rejection/provisioning need their later separately authorized audited operator contracts.

## Persistence and module boundaries (0013)

Identity owns the narrow bound-admin-session function, checking session audience/expiry/CSRF/user status. Onboarding functions call this explicit application contract; they do not query identity-owned tables. Applicant UUID is an opaque verified reference, with no cross-module table query or cascade. `qmenux_onboarding` owns applications and append-only application_events, with default-deny forced RLS and no runtime table privileges. These are pre-tenant applicant records, not falsely tenant-scoped rows. Every runtime-executable definer contract derives the applicant from the verified session and explicitly constrains all selects/locks/writes to that applicant. No caller can choose an applicant ID, including through another applicant's cursor or resource UUID.

The audit trigger requires transaction-local applicant actor context, records old/new/actor/UTC state atomically and protects identity/creation bookkeeping/submitted records. Runtime can execute only the four use-case functions, not the audit trigger or direct table operations. Event UPDATE/DELETE/TRUNCATE is rejected. `Database.begin` rejects/destroys dirty onboarding actor context in addition to existing tenant/catalog context; successful commit/rollback clears local state. Runtime/database administrators remain trusted server capabilities, and administrators able to alter schema are not claimed cryptographically unable to tamper.

The service maps unauthenticated/bad-bound proof to401, conflicting retries/revisions/state409, missing/foreign objects404 and unexpected database failures to minimal503 without SQL/parameters. Validation400 precedes storage. Transactions have existing pool/query bounds and commit/rollback/discard behavior; there are no automatic retries or automatic pending→approved transitions.

Up is additive after exactly0001–0012. Down requires exactly0001–0013, locks applications/history with hidden-data-safe checks, refuses any data and removes only this slice's empty schema/function/ledger objects. No real applications/history may be deleted to force rollback; use a reviewed forward correction once populated.0001–0012 remain immutable. Manual Neon probes remain guarded at0009; this migration was run only in the complete disposable local cluster.

## Evidence and remaining work

The local fixture proves atomic migration rollback/down/reapply/duplicate/old-down/later-version/data refusal; all3 provider identity namespaces; API/admin and same-user cross-session proof denial; validation; concurrent keyed create/edit/submit; retry binding through edits; owner isolation/list pagination; no-op/old-new/actor audit; rollback of application+event together; table/function/RLS/immutability boundaries; dirty pool disposal; expiry/suspension/revocation. Exact tenant/membership snapshots stay unchanged, and pending applicants fail actual DraftCatalog writes even with a synthetic true entitlement policy.

No business display name/user data from a real person is collected here. New data inventory for legal review: proposed display name plus initial-name retry binding, internal applicant UUID, request UUID, draft/pending state, revision, timestamps and audit. Retention/deletion, notices, lawful processing/transfer, recovery and duplicate-business review remain for named review; no binding agreement/privacy text or consent evidence is fabricated. No legal item is APPROVED and ONB-001/002 are not fully accepted.

Next: narrow authenticated HTTP/BFF application adapters, mobile draft/edit/submit/pending UI and real transport tests; then independently protected operator review/provisioning/license flows. Preserve exact-Origin, host-only cookies and session-bound CSRF, no-store, bounded bodies/timeouts, idempotent retry behavior and honest offline/error states. Actual IdP/privacy/abuse/MFA/device/security/legal acceptance and named reviewer approval remain before real-user enablement. Marketing stays last and V1 payments remain absent.

## Dedicated internal HTTP adapter — 2026-10-26

The next development slice registers only POST /v1/internal/admin-onboarding/list, /drafts, /drafts/:id/edit and /drafts/:id/submit. These call the existing four use cases with numeric JSON limit/revision and the same minimal projections (mutation envelopes {application}, list {items,nextCursor}). No public onboarding or operator approval route is added. Browser BFF/mobile delivery follows separately; this adapter itself writes no cookie and issues no redirect.

Require explicit ADMIN_ONBOARDING_ENABLED=true, non-Preview runtime, verified TLS and an independent43-character ADMIN_ONBOARDING_SECRET. Missing/malformed/disabled config503; a reused sign-in or maintenance key is a configuration error503. Exactly one matching Bearer is required before body/use-case work; missing/wrong/duplicate/cookie/forwarded auth401. ADMIN_BFF_SECRET retains its sign-in-only purpose. No credential is created/bound or provider enabled by this code. Key rotation must coordinate both servers and retirement/restriction of prior deployments; changing one env value does not revoke old deployment snapshots.

Shared machine JSON parsing preserves existing auth contracts, with fatal UTF-8 decoding,8KiB raw-body bound, one JSON content type, no encoding/query, flat string/finite-number schema, duplicate escaped-key rejection and per-operation closed/required fields. Onboarding limit/revision must be JSON integers; session/CSRF/key/name/cursor strings remain validated by their use case. Unexpected/pre-controller errors are minimal no-store/no-referrer, with meaningful401/404/409 and existing parser413. Unsupported known-path methods explicitly405/Allow POST before operations, including HEAD/OPTIONS. HTTP200 is used for both initial and idempotently replayed mutations; approval/licensing authority is unchanged.

Boundary tests deny malformed/gated/cross-purpose requests before storage. A separate real HTTP/local PostgreSQL fixture exercises keyed concurrent create, edit/conflict, submit/replay, owner isolation, CSRF denial, dates/projections, immutable event counts and no membership grant. Existing signed-provider/auth/parser regressions remain required. No real applicant, cloud migration/deployment, hosted CI, actual provider/device/privacy/legal/security acceptance is inferred. Rollback removes controller/BFF callers and retires only this machine key after checking all deployments; retain populated0013 and its history.
