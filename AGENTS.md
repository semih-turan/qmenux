# Instructions for AI Coding Agents

> Status: Draft v0.1 | Date: 2026-10-25 | Owner: Product/Engineering | Review before production.

## Source of truth and precedence
1. Explicit current task and acceptance criteria; 2. approved ADRs; 3. PRD and domain/security/compliance docs; 4. this file; 5. implementation. If contradictory, **stop and report conflict** rather than silently choose.

## Mandatory workflow
1. Read `README.md`, relevant docs, task and ADRs before coding.
2. State a short implementation plan and files affected.
3. Make one bounded change; preserve module boundaries.
4. Add migrations, tests, and docs for behavior changes.
5. Run lint, typecheck, tests and build where available; report actual results, never claim unrun tests passed.
6. Update `docs/01-product/PROGRESS.md`; propose an ADR for architectural changes.

## Hard rules
- Mobile-primary: design at 320/375/390/430px; test keyboard, safe areas and touch targets.
- Never leak tenant data across queries, logs, caches, jobs, exports, media, websockets or analytics.
- All tenant-scoped writes require server-resolved context and authorization; enforce RLS where applicable.
- Never activate licenses from browser redirects; verify provider server callbacks, idempotency and payment amount.
- Never treat AI-suggested calories/allergens as verified facts; require provenance and explicit approval.
- No hardcoded secrets, tokens, API keys, card details or live personal data in fixtures.
- No speculative legal assertions. Record official sources and dates; block launch on unresolved compliance questions.
- Avoid speculative abstractions, microservices and unrequested features.
- No cross-module direct table access except via explicit application contracts/read models approved by ADR.

## Definition of done
Acceptance criteria demonstrated, migration rollback considered, security and isolation tests pass, error/empty/loading/offline states covered, accessibility checked, docs and progress updated.

## Legal gating and task order
Follow `docs/01-product/TASKS.md` as authoritative backlog. Start with T000 and LEG-001 through LEG-005. Read `docs/05-compliance/LEGAL_REQUIREMENTS_REGISTER.md`, `LEGAL_OPERATIONS.md`, `COMPLIANCE_TEST_MATRIX.md` and `RELEASE_LEGAL_CHECKLIST.md` before touching legal-sensitive flows. Never mark a legal item APPROVED without named reviewer and dated evidence. Never generate binding legal text as if lawyer-approved.

## Additional mandatory agent rules
- Treat 2026-10-25 product amendments as binding: geofence, mobile-only-complete admin, ten public themes, one active product image, optional Wi-Fi, A4 menu/allergen PDFs, QR scan totals/month, fixed license plus optional AI credits.
- Do not implement geolocation as silent tracking or an unspoofable security barrier.
- Do not publish AI-generated nutrition/allergen values without explicit human approval.
- Every AI action must show a server-verified credit quote before charging.
- No task may be marked DONE until its acceptance tests and evidence are recorded in TASKS.md and PROGRESS.md.
- Resolve conflicting legacy counts (e.g. 4 themes) in favor of the newest signed decision; flag any remaining conflicts.

## v4 agent instructions
- Read `docs/01-product/FEATURE_TRACEABILITY.md` and new feature specs before implementing T025–T034.
- Every import is a draft until human review; never trust AI/imported allergens as verified.
- Do not delete or mutate historical published menu revisions; rollback creates a new revision.
- No visitor identity/fingerprinting in analytics unless separately approved and documented.
- Do not make push notifications or WhatsApp CTA mandatory; both opt-in/configurable.
- Every new feature must work entirely on mobile owner PWA and respect tenant RLS, tests, single-license pricing and legal gates.
- Only mark a task DONE with linked tests, evidence and reviewer approval.

## Approved production routing and integration rules (2026-10-25)
- Product name QMenuX; canonical hosts: `qmenux.com`, `admin.qmenux.com`, `superman.qmenux.com`, `api.qmenux.com`, `{slug}.qmenux.com`. Never generate `workspace` or `control` URLs as canonical routes.
- Read `DOMAINS_AND_TRUST_BOUNDARIES.md`, `PUBLIC_API_AND_CHANNELS.md`, `INTEGRATION_SECURITY.md` before auth/API/integration tasks.
- Superadmin hostname must not be treated as a secret. Require identity-aware access, mandatory MFA and server-side platform role checks. No parent-domain shared auth cookies.
- External clients require tenant-scoped, least-privilege, revocable credentials; provider webhooks require verified signatures and replay/idempotency protection. Never embed API keys in browser apps.
- Do not implement WhatsApp/Telegram messaging as already-approved production features; provider setup and legal reviews remain pending.


## v6 agent constraints
- Implement **menu + tenant admin + superadmin before full marketing landing**. Implement core identity/OIDC and minimal login/onboarding early because panels depend on it.
- Do not activate new tenant at signup; require explicit privileged superadmin approval and license grant.
- Google, Microsoft (Outlook) and Apple federated login must use secure provider-specific OIDC/OAuth 2.0 protocols; no fake social sign-in.
- No V1 payment gateway, checkout, recurring charge or self-service paid activation. PayTR-like payments are future-only.
- If legacy docs imply earlier billing rollout, this v6 policy overrides them. Keep TASKS.md and ROADMAP.md synchronized.

## v7 visual/product constraints
- QMenuX targets cafés/coffee shops AND restaurants; avoid restaurant-only language and sample imagery.
- Use `docs/03-frontend/BRAND_DESIGN_SYSTEM.md` as single source for shared admin/superadmin palette.
- Public themes are exactly the ten IDs in `PUBLIC_THEME_CATALOG.md`; only customer menus change theme.
- Business-type suggestions are optional/editable, do not fork UI or auto-publish unverified demo food facts.
- Keep T043 landing LAST; T044 shared admin design is early work.


## v8 binding infrastructure rules
- Use **Neon PostgreSQL** as canonical database and **Vercel** as production host for all Next.js apps and stateless NestJS REST API. See `docs/08-operations/VERCEL_NEON_INFRASTRUCTURE.md`.
- Do not assume a persistent NestJS process on Vercel Functions. Long jobs and BullMQ workers require external durable worker hosting (T049; provider TBD).
- Use Neon pooled runtime and direct migration connections as appropriate, with explicit transaction-local tenant RLS and tests for pool reuse.
- Keep production secrets out of preview deployments and browser bundles; no client-side DB credentials.
- ORM, Redis provider, worker host, deployment region and plan are **not** finalized. Implement T047 proof-of-concept before choosing.
- Earlier generic Docker/VPS production instructions are superseded. Docker remains allowed for local development/external worker.
- Keep T043 landing LAST; initial access remains superadmin-approved, without V1 payment gateway.

## v9 mandatory Git and change-control policy
- Follow `docs/08-operations/GIT_WORKFLOW.md` before **every** coding task.
- The Git repository already exists; inspect and preserve `.git`, default branch, remote configuration and uncommitted work. Never reinitialize, reset or delete user history.
- Use task-specific branches (`feat/T001-...`) and Conventional Commits with task IDs.
- Do not push, merge, force-push, rewrite history or make commits without explicit user authorization. Stage only task-related paths; never commit secrets.
- Run checks and review diffs before requesting commit approval; report branch, changes, tests, commit status and next task.
- `.gitignore` is a starting template: preserve any existing custom rules when integrating into an existing repository.
