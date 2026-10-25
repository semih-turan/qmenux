# Deployment and Operations

> Status: Draft v0.1 | Date: 2026-10-25 | Owner: Product/Engineering | Review before production.

## Environments
Local, staging and production with separate databases, secrets, object buckets, payment credentials and domains. Containerized Next.js frontends, NestJS API and worker; managed or well-operated PostgreSQL, Redis, Cloudflare R2 and CDN.

## Domain routing
Wildcard DNS/TLS for `*.example.com`, explicit `admin` and `control` origins, reserved slug protection, proxy host allowlist and verified custom-domain onboarding later. Separate service-worker scopes, security headers and cookie domains; avoid leaking auth across tenant origins.

## CI/CD
Build/test -> migration safety check -> staging deployment -> smoke/E2E -> production rollout -> health monitoring. Use expand/contract migrations and rollback-compatible releases. Feature flags for AI/payment.

## Observability
Structured JSON logs with trace/correlation/tenant IDs (no sensitive payloads), metrics for request latency, cache hit, queue lag, failed jobs, webhook verification failures, subscription anomalies, payment reconciliation gaps and DB saturation. Alert on error budgets and failed backups.

## Backup/DR
Automated encrypted PostgreSQL backups with point-in-time recovery if available; documented RPO/RTO to decide; periodic restore tests; object-store lifecycle/versioning; secret rotation and incident runbooks.

## Operational runbooks
Tenant suspension/reinstatement, manual license grant, failed payment callback, queue backlog, AI cost spike, leaked credential, corrupted cache, DB restore and regulatory rule hotfix. Never use direct SQL for ordinary admin operations without audited emergency procedure.

## Production DNS and edge routing for QMenuX
Provision explicit DNS/edge routes for `qmenux.com`, `www.qmenux.com`, `admin.qmenux.com`, `superman.qmenux.com`, `api.qmenux.com`, plus wildcard `*.qmenux.com` for guest tenant menus. Explicit reserved routes must take precedence over wildcard resolution. Configure managed TLS for all hosts and wildcard certificate issuance/renewal alerts.

`superman.qmenux.com` must sit behind Cloudflare Access or equivalent identity-aware proxy with mandatory MFA and approved operator identities; API independently enforces platform authorization. Separate session cookies and CSP/CORS origins; avoid caching authenticated responses. Test Cloudflare Access with installed mobile PWA and service worker.

Expose `/v1` on `api.qmenux.com` through WAF/API gateway with separate limits for public reads, owner writes, external integration clients and expensive AI/PDF operations. Do not expose database/Redis/worker ports publicly. Add monitoring for abuse, token failures, webhook delivery and auth bypass attempts. Use distinct staging domains and secrets.


## v6 release sequencing
- Deploy and test auth/callback services and `admin.qmenux.com`, `superman.qmenux.com`, `api.qmenux.com` before marketing landing.
- Provider credentials/redirect URIs per environment, secrets in managed store, Apple/Microsoft/Google setup checklist, rotation, safe rollback.
- During V1, disable checkout routes and payment-related feature flags at API level, not only UI.
- Publish `qmenux.com` landing only after product flows, mobile QA and security/legal gates; early placeholder may link to operational login.


## v8 authoritative hosting override: Neon + Vercel
The generic container-hosted frontends/API and generic PostgreSQL references above are **historical, superseded for production**. Actual production choice: **Vercel for all Next.js frontends and stateless NestJS HTTP API; Neon PostgreSQL for database**. Docker may be used locally and for an external worker. `superman.qmenux.com` and other hostnames remain unchanged.
- API on Vercel Functions: validate NestJS adapter/bundle, cold starts, runtime limits, session isolation, CORS, connection pooling and rate limiting.
- Never run always-on BullMQ consumers or long-running jobs inside Vercel Functions. Choose and deploy external worker host; queue provider must support chosen job library.
- Neon pooled connection for compatible runtime transactions; direct for migrations; transaction-local RLS and tenant leak tests are mandatory.
- Keep Vercel preview/staging/prod separated from Neon branches/projects and secrets; no production DB in preview.
- Use Cloudflare R2 for images/PDF; signed uploads/downloads; verify wildcard DNS and edge TLS with Vercel.
- Keep landing last and no V1 payment integration. See `VERCEL_NEON_INFRASTRUCTURE.md` and `DEPLOYMENT_DECISIONS.md`.

## v9 Git-to-Vercel delivery policy
- GitHub-to-Vercel connection and automatic preview deployments require explicit owner configuration; do not assume remote exists or is connected.
- Pull requests should pass T053 CI checks before merging; previews use isolated Neon branches/test credentials and no production secrets.
- Production deployments occur from approved default-branch changes with environment-specific Vercel variables and migration controls; do not let Codex push/merge automatically.
