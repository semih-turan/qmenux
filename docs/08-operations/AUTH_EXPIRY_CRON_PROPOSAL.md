# Expired credential cron — review proposal

Status: OWNER-APPROVED exception; ENABLED; first automatic invocation pending | 2026-10-25 | Owner: Engineering | Explicit approval: “Evet, yalnız bu temizlik işine istisna ver ve etkinleştir”. Technical reviewer/name and real-user release acceptance remain pending.

## Concrete proposal
Allow exactly one bounded expired-credential maintenance job to call the existing protected API endpoint directly from Vercel Cron, without a separate worker. The approved [configuration draft](../../infrastructure/spikes/auth-expiry-cron.proposed.json) is now active at [apps/api/vercel.json](../../apps/api/vercel.json), deployed only to qmenux-api after explicit approval. Schedule `0 3 * * *` means daily03:00UTC /06:00 Europe/Istanbul on the current date. Existing API Production target uses the development database; this proposal does not approve real-business launch, legal retention or a general cron/worker architecture.

## Policy conflict resolved by the narrow owner approval
The binding [v8 infrastructure document](VERCEL_NEON_INFRASTRUCTURE.md#confirmed-choices-and-non-choices) states:

> Separate worker hosting is REQUIRED for continuously consuming queues, long-running imports/PDF/AI processing, retries and cron-driven workloads.

The [Vercel Functions constraints](VERCEL_NEON_INFRASTRUCTURE.md#vercel-functions-constraints) also specify:

> Use scheduled external triggers/Vercel Cron for bounded enqueue-only actions if appropriate, with authenticated idempotent handlers and provider plan verification.

The proposed handler directly runs a bounded SQL sweep; it does not enqueue work. The general production-development authorization does not silently amend those architecture rules. The owner explicitly approved this named exception on2026-10-25; leave the general worker rule unchanged for imports/PDF/AI, durable retries and other cron-driven workloads. No worker/Redis provider is selected by this exception.

## Pre-activation evidence already available
- Clean entry branch feat/T004-identity-foundation, HEAD20dbeea; no agent Git writes.
- Read-only Vercel team API reports current plan `pro`. This records the existing account, not a plan selection, purchase or real-business capacity approval.
- Existing API cron definitions `[]`; current deployment dpl_8a2QCytamkLArxh69DtarJfQYYLd. No schedule currently defined.
- The preceding step verified the live endpoint's dedicated Production-only CRON_SECRET authentication and bounded0006 cleanup; no key value is included in this proposal. Its prior checks are evidence, not newly rerun tests.
- Fixed caps:100 expired attempts,100 expired identity sessions,100 expired operator sessions per invocation. Live sessions/principals/tenant business records are preserved. Runtime/query timeouts and transactional SKIP LOCKED behavior already implemented/tested.

## Delivery and operational limits
Vercel uses UTC schedules and invokes production jobs with GET and the configured CRON_SECRET Bearer header. Delivery is best effort, can be missed or duplicated, and failed invocations are not automatically retried. Existing delete-if-expired transactions make duplicates safe; every invocation remains bounded. A missed run or a backlog larger than the batch capacity requires manual catch-up/review. Daily scheduling is not a deletion-time SLA, unlimited drain or full retention policy.

Do not add another secret, role, service, queue, environment target or schema. Keep the existing API-only Production secret and no frontend/Preview copy. Long-running or durable work still needs the external worker architecture. Real-user rollout remains gated on monitoring/retention/provider/MFA/security/legal review.

## Authorized execution after approval
1. Record the explicit exception approval in DECISIONS; do not infer named reviewer/legal sign-off.
2. Verify no owner-created active config would be overwritten, then put this draft at apps/api/vercel.json.
3. Inspect CLI upload, deploy existing qmenux-api Production under pinned Node24 and verify native build.
4. Inspect the provider cron definition: only the expected path and daily schedule; confirm existing authentication remains enforced. Record actual manual/provider-trigger and first scheduled-run evidence separately, never claim an automatic run before it occurs.
5. Update TASKS/PROGRESS with actual results and remaining review/first-delivery gaps. No automatic Git commit/push/merge.

Rollback: disable the job in Vercel if immediate stop is needed; remove its configuration and redeploy to retire the definition. Verify the provider state. Do not rely solely on application rollback; do not delete data/keys or alter other jobs. The manual CLI and protected endpoint can remain available.

## Historical verification performed for the inactive proposal
JSON parse/exact path/daily schedule, current-date UTC→Europe/Istanbul conversion, absence of active apps/api/vercel.json, exclusion of infrastructure draft from deployment inputs and diff checks. Application code, secrets, DB and deployment unchanged; no new lint/build/application test claim.

Sources checked2026-10-25: [Vercel configuration](https://vercel.com/docs/project-configuration/vercel-json#crons), [GET/UTC invocation](https://vercel.com/docs/cron-jobs), [delivery/error/plan behavior](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

## Activation evidence — 2026-10-25
Owner approval quoted above authorizes exactly this exception. Clean entry feat/T004-identity-foundation at f91694a; no agent Git writes. The active config contains exactly one GET job, `0 3 * * *`, path `/v1/internal/maintenance/auth-expiry`. JSON/path/count/timezone assertions PASS; CLI dry upload73 files/309467 bytes includes apps/api/vercel.json and excludes private/config/docs/infrastructure file contents.

Pinned local Node24.22.1: root `pnpm lint` and `pnpm typecheck` PASS; `pnpm --filter @qmenux/api test` PASS, including fresh API build and all5 real HTTP/PostgreSQL/RLS/expiry tests. Unchanged frontend tasks reused local Turbo cache. No new dependency, migration, runtime behavior, credential, privilege or frontend change.

Native Vercel Production deployment dpl_G818sj8dtCBbWoRFfQCgSRehUbQp READY; [immutable API](https://qmenux-1gu53npvd-semihs-projects-fff996f3.vercel.app), canonical api.qmenux.com. Remote CLI65.1.0/pnpm10.29.2, iad1, build11s. Build-only Turbo warnings about DATABASE_URL/CRON_SECRET are intentional: secrets remain runtime-only, not forwarded into build/browser bundles. Existing API Production target retains the development database and existing secret.

Read-only provider project verification PASS: cron deploymentId matches the new deployment, disabledAt=null, exactly one definition matching the expected host/path/schedule. Canonical liveness/readiness/providers200; all providers remain disabled. Missing/incorrect Bearer requests401 with no-store. No key was retrieved/rotated and no authenticated manual run was newly triggered in this activation step; the preceding HTTP-adapter evidence remains historical. First actual scheduled invocation is still unobserved (next expected2026-10-26 at06:00 Europe/Istanbul); record its actual provider status later, not as passed now. No hosted CI, browser/device or unrelated frontend build rerun. T004 remains IN_PROGRESS; reviewer/legal/retention/MFA/real-user gates remain open.

## First-delivery observation procedure — 2026-10-25
At2026-10-25T19:10:42Z the first daily03:00UTC slot has not occurred since activation. Read-only project metadata still confirms the expected single enabled definition on dpl_G818sj8dtCBbWoRFfQCgSRehUbQp. CLI request logs show exactly two matching GET requests, both401, corresponding to preceding missing/incorrect-key checks; neither is a successful cron invocation. The CLI query also returned unrelated root requests, so inspect exact requestPath rather than assuming search results are exact matches.

After2026-10-26T03:00:00Z, use the existing CLI (no credential retrieval or new service):
```sh
vercel logs --project qmenux-api --scope semihs-projects-fff996f3 --environment production --since 2026-10-26T03:00:00Z --until 2026-10-26T03:15:00Z --limit 100 --json
```
Inspect exact requestPath `/v1/internal/maintenance/auth-expiry`, requestMethod GET, responseStatusCode and timestamp. Cross-check the scheduled execution in the Vercel project's Cron Jobs history; HTTP200 alone cannot distinguish a manually authorized request from provider delivery. Keep timestamps/status/deployment only in evidence; do not copy raw headers, secrets or identifying log payloads. A truncated100-record result needs a narrower interval/additional read before concluding absence. If redeployed, recheck current cron deployment/definition first rather than filtering exclusively to the old deployment.

Record successful provider-triggered2xx as delivery evidence only; response counts/table invariants are separately covered by existing tests. Missing delivery remains pending/investigate, not PASS.401 indicates the existing secret binding needs inspection;5xx indicates runtime/DB failure. Use provider runtime details and health/readiness checks before making changes; do not print/rotate the key, widen permissions, disable authentication or repeatedly trigger catch-up automatically. Any manual invocation must be recorded separately and remains bounded. Vercel does not automatically retry failed calls. No watcher, external monitor, alerting service or scheduled agent task was created by documenting this procedure.
