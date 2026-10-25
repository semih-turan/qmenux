# Expired credential cron — review proposal

Status: PROPOSED, not enabled | 2026-10-25 | Owner: Engineering | Architecture exception awaiting explicit owner approval; reviewer/date not recorded.

## Concrete proposal
Allow exactly one bounded expired-credential maintenance job to call the existing protected API endpoint directly from Vercel Cron, without a separate worker. Copy the inactive [configuration draft](../../infrastructure/spikes/auth-expiry-cron.proposed.json) to `apps/api/vercel.json` only after approval and deploy only qmenux-api. Schedule `0 3 * * *` means daily03:00UTC /06:00 Europe/Istanbul on the current date. Existing API Production target uses the development database; this proposal does not approve real-business launch, legal retention or a general cron/worker architecture.

## Existing policy conflict
The binding [v8 infrastructure document](VERCEL_NEON_INFRASTRUCTURE.md#confirmed-choices-and-non-choices) states:

> Separate worker hosting is REQUIRED for continuously consuming queues, long-running imports/PDF/AI processing, retries and cron-driven workloads.

The [Vercel Functions constraints](VERCEL_NEON_INFRASTRUCTURE.md#vercel-functions-constraints) also specify:

> Use scheduled external triggers/Vercel Cron for bounded enqueue-only actions if appropriate, with authenticated idempotent handlers and provider plan verification.

The proposed handler directly runs a bounded SQL sweep; it does not enqueue work. The general production-development authorization does not silently amend those architecture rules. Explicitly approve this named exception before enabling the schedule; leave the general worker rule unchanged for imports/PDF/AI, durable retries and other cron-driven workloads. No worker/Redis provider is selected by this exception.

## Evidence already available
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

## Verification performed for this proposal
JSON parse/exact path/daily schedule, current-date UTC→Europe/Istanbul conversion, absence of active apps/api/vercel.json, exclusion of infrastructure draft from deployment inputs and diff checks. Application code, secrets, DB and deployment unchanged; no new lint/build/application test claim.

Sources checked2026-10-25: [Vercel configuration](https://vercel.com/docs/project-configuration/vercel-json#crons), [GET/UTC invocation](https://vercel.com/docs/cron-jobs), [delivery/error/plan behavior](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
