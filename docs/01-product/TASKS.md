# AI Agent Task Backlog

> Status: Draft v0.1 | Date: 2026-10-25 | Owner: Product/Engineering | Review before production.

## Task execution contract
Each task must contain ID, dependencies, objective, files, implementation steps, acceptance criteria, tests, rollback, owner, status and evidence. Work on one task at a time; only mark DONE after tests and reviewer approval. `BLOCKED_LEGAL` means coding may proceed only on unrelated tasks.

## Phase 0 — Requirements and legal foundations (before feature coding)
| ID | Task | Dependencies | Acceptance evidence | Status |
|---|---|---|---|---|
| T000 | Review PRD, confirm domain, license interval, tenant/branch scope, operating legal entity | — | Signed decision record | TODO |
| LEG-001 | Official source register and legal applicability mapping | T000 | Each LEG rule has source, scope, effective date, reviewer | TODO |
| LEG-002 | Merchant B2B SaaS agreement, notices, DPA applicability | T000 | Counsel-reviewed document versions | TODO |
| LEG-003 | KVKK data map, cookie design, retention, subprocessors | T000 | Approved data inventory and consent flow | TODO |
| LEG-004 | Food/menu compliance rule matrix by merchant classification | LEG-001 | Approved rules with effective dates and regression examples | TODO |
| LEG-005 | Invoicing, payment and e-commerce applicability review | T000 | Accountant/legal sign-off; B2B/B2C determination | TODO |

## Phase 1 — Engineering foundation
| ID | Task | Dependencies | Acceptance evidence | Status |
|---|---|---|---|---|
| T001 | Initialize pnpm/Turborepo, lint, typecheck, CI | T000; local-only exception below | CI green | IN_REVIEW |
| T002 | PostgreSQL schema and migration strategy | T001 | Migrations and rollback drill | TODO |
| T003 | Tenant resolver and RLS integration tests | T002 | Cross-tenant denial tests | TODO |
| T004 | Identity, RBAC, privileged MFA | T003 | Auth and MFA tests | TODO |
| T005 | Catalog domain and APIs | T003,T004 | Contract tests, price history | TODO |
| T006 | Mobile admin shell and product CRUD | T005 | iPhone/Android touch workflow tests | TODO |
| T007 | Public menu PWA and cache invalidation | T005 | Fresh price tests, offline stale warning | TODO |
| T008 | Theme registry foundation (ten themes delivered in T020) | T007 | Theme snapshot tests | TODO |
| T009 | QR generation and print foundation (A4 exports in T018) | T007,LEG-004 | Mobile print/PDF test | TODO |
| T010 | Subscription and license states, one fixed plan | T004 | Expiry/grace/renewal tests | TODO |
| T011 | Superadmin mobile PWA | T004,T010 | MFA and mobile operation tests | TODO |
| T012 | Compliance rule engine and human review | T005,LEG-004 | CT-001 through CT-005 | TODO |
| T013 | Observability, backups, deployment | T001-T012 | Restore and monitoring drills | TODO |
| LEG-006 | Contract/notice acceptance evidence and consent UX | LEG-002,LEG-003,T006 | CT-006 through CT-008 | TODO |
| LEG-007 | Production legal and security release gate | T013,LEG-005,LEG-006 | Signed release checklist; blockers zero | TODO |


## Phase 1 extension — Newly approved requirements (2026-10-25)
| ID | Task | Dependencies | Acceptance evidence | Status |
|---|---|---|---|---|
| T016 | Geofence settings, radius and province/district policies, guest access states | T003,T006,T007,LEG-003 | GEO-001..003; policy/permission ADR | TODO |
| T017 | End-to-end phone-only owner + superadmin workflows | T006,T011 | UX-001 iOS/Android recordings, accessibility checks | TODO |
| T018 | Published-snapshot A4 menu PDF + separate allergen PDF | T005,T009,T012,LEG-004 | PDF-001, CT-015 | TODO |
| T019 | Optional branch guest Wi-Fi block and mobile settings | T006,T007,LEG-003 | WIFI-001, CT-013 | TODO |
| T020 | Deliver ten public themes; fixed shared admin theme | T008,T017 | THEME-001 ten-theme matrix | TODO |
| T021 | Enforce max one active product image incl. replacement | T005 | IMG-001 DB + API tests | TODO |
| T022 | QR valid-scan all-time and current-month counters | T007,T009,LEG-003 | QR-001, CT-016 | TODO |
| LEG-009 | Geo, Wi-Fi, analytics and AI content legal/privacy review | LEG-001,LEG-003 | CT-012..016; counsel approval | TODO |
| T024 | Future AI locked controls, action quotes and credit ledger | T015,T017 | AI-001 quote/debit/review tests | FUTURE |

### Release gate update
T013 and LEG-007 must depend on **T016–T022 and LEG-009**, in addition to their original dependencies. T017 is a cross-cutting UX acceptance gate. T024 is future-only; V1 may show disabled AI entry points without an operational credit purchase flow.


## v4 additions — approved feature workstream (2026-10-25)
**Execution:** Tasks remain TODO until implementation, automated tests, mobile QA and reviewer evidence are recorded. V1 tasks T025–T029 are release blockers; V1.5 tasks T030–T034 are later unless T000 explicitly revises scope.

| ID | Release | Task | Dependencies | Acceptance evidence | Status |
|---|---|---|---|---|---|
| T025 | V1 | Product SOLD_OUT/HIDDEN states and mobile quick actions | T005,T006,T007 | AV-001; tenant/RLS, public badge/hide | TODO |
| T026 | V1 | Immutable published menu revision history and restore-as-new | T005,T007,T012 | REV-001; audit, concurrency, cache tests | TODO |
| T027 | V1 | Mobile CSV/XLSX staged import, mapping, dry run and draft commit | T005,T006,T012 | IMP-001; validation/security/error export | TODO |
| T028 | V1 | Public product search and dietary/allergen filters | T005,T007,T020,T025 | SEARCH-001; Turkish locale and uncertainty tests | TODO |
| T029 | V1 | Table QR create/print/revoke and scoped scan counts | T009,T022 | TABLEQR-001; token security, print QA | TODO |
| T030 | V1.5 | Locale data, translations, fallback and mobile language editor | T005,T007,T012 | I18N-001; disclosure review | TODO |
| T031 | V1.5 | Scheduled menus and future price changes | T026,T030 | SCH-001; timezone/overlap/cache tests | TODO |
| T032 | V1.5 | Expanded anonymous category/product/table/time analytics | T022,T029,LEG-003 | ANA-001; privacy/retention review | TODO |
| T033 | V1.5 | Optional WhatsApp contact CTA and mobile settings | T006,T007 | WA-001; validation, hide when off | TODO |
| T034 | V1.5 | Opt-in PWA push, preferences, in-app inbox and delivery worker | T006,T011,T010 | PUSH-001; iOS/Android and opt-out | TODO |
| LEG-010 | Legal gate | Imports, translations, analytics, WhatsApp, push and scheduled pricing review | LEG-001,LEG-003,LEG-004 | CT-017..022 and reviewer sign-off | TODO |

### Updated release gates
- **V1 production gate:** `T013` and `LEG-007` also require T025–T029 and relevant LEG-010 reviews. Prior v3 gates remain. T030–T034 are not V1 blockers.
- **V1.5 gate:** T030–T034, LEG-010 and relevant CT-017..022; production review required before enabling.
- Avoid circular task dependencies: T013 depends on feature completion, but feature tasks must **not** depend on T013. `T024` remains FUTURE and depends on future T015; this is intentional.
- Owner approval required for remaining ADRs (analytics event semantics, menu/PDF sold-out rules, locale fallback, schedules).

## Future (not V1)
| ID | Task | Dependencies | Acceptance evidence | Status |
|---|---|---|---|---|
| T014 | Payment gateway port, PayTR/other adapter, webhook idempotency | T010,LEG-005 | Provider sandbox and CT-009 | FUTURE |
| T015 | AI credit wallet, queue and generation | T014 | Ledger integrity and AI review tests | FUTURE |
| LEG-008 | AI content and payment policy re-review before launch | T014,T015 | CT-010/CT-011 and legal sign-off | FUTURE |

## First task handoff: T000
Read all docs. Create a decision checklist for brand/domain, legal entity, annual/monthly license period, fixed price, merchant onboarding model, tenant/branch licensing, storage region, payment activation date. Do not invent answers. Record unresolved decisions in DECISIONS.md. Do not implement features until T000 is approved.

## Example task contract: T003
Implement server-side hostname-to-tenant resolution and tenant-scoped DB transactions with RLS. Tests must prove A cannot read/write B through API or direct application DB role, and that missing context denies access. Do not expose tenant choice via arbitrary client header. Document trusted proxy/host allowlist. No task is complete without passing integration tests.

## QMenuX hostname, API and security workstream (2026-10-25)
| ID | Phase | Task | Dependencies | Acceptance evidence | Status |
|---|---|---|---|---|---|
| T035 | V1 | Configure QMenuX canonical host routing, TLS, reserved tenant slugs, host validation and environment separation | T001,T002 | HOST-001; staging DNS/TLS validation | TODO |
| T036 | V1 | Isolate `superman` from tenant admin; identity-aware proxy, mandatory MFA/passkey, server RBAC, step-up, secure sessions | T003,T004,T035 | AUTH-001..003, OPS-001 | TODO |
| T037 | V1 | Establish `api.qmenux.com/v1`, OpenAPI contracts, auth audience/scope model, tenant isolation and rate limits | T003,T004,T035 | API-001, API-003 | TODO |
| T038 | Later | External client credentials, key lifecycle, scoped access, signed webhooks and audit | T037,LEG-011 | API-002, HOOK-001, external threat-model approval | TODO |
| T039 | Future | Telegram and WhatsApp Business provider adapters with tenant binding and opt-in policies | T038,LEG-011 | CHANNEL-001 and provider sandbox approval | FUTURE |
| LEG-011 | V1 foundation / later channel launch | Review external API terms, KVKK, identity provider subprocessors, Telegram/WhatsApp policies and messaging permissions | LEG-003,LEG-010 | Dated legal applicability record and sign-off before enabling each channel | TODO |

### Updated release dependencies
T013 and LEG-007 must additionally include **T035–T037** as V1 release gates. T038 and T039 are not V1 blockers; external production integrations must not be exposed until their own security and legal gates pass.

### T000 resolved vs open
**Resolved:** Brand QMenuX, `qmenux.com`, `admin.qmenux.com`, `superman.qmenux.com`, `api.qmenux.com`, tenant guest subdomains. **Still open:** legal entity, license period/price, hosting/data region, merchant onboarding and provider-specific integrations. Do not mark all of T000 DONE merely because hostname decisions are approved.


## v6 — Identity, gated onboarding, landing-last and deferred payments (2026-10-25)
| ID | Release | Task | Dependencies | Acceptance evidence | Status |
|---|---|---|---|---|---|
| T040 | V1 foundation | Secure federated identity (Google, Microsoft/Outlook, Apple), PKCE/OIDC, linking, minimal auth screens | T001,T004,T035,LEG-003 | AUTH-004..006, provider test-account evidence | TODO |
| T041 | V1 foundation | Pending applications and superadmin approval/rejection workflow; tenant access gate | T003,T010,T011,T040 | ONB-001..002, cross-tenant denial | TODO |
| T042 | V1 | Manual license grant/extend/revoke, entitlement checks; disable all online checkout | T010,T036,T041 | PAY-001..003, audit, API denial | TODO |
| T043 | **LAST: marketing** | Build `qmenux.com` landing, Login/Sign up entry, features, pricing, SEO and legal pages | T007,T017,T020,T041,T042,LEG-012 | LAND-001..005, mobile/SEO/legal QA | TODO |
| LEG-012 | V1 auth + later landing | IdP terms/KVKK, signup terms, approval notices, marketing privacy/cookies | LEG-002,LEG-003,LEG-005 | Signed applicability/notice review | TODO |

### Mandatory execution-order correction
- `T040` (identity) and `T041` (approval) must be completed early; **T043 (full marketing landing) is the final UI milestone**. Minimal functional login/onboarding screens may be built early, but are not T043.
- `T006` tenant admin and `T011` superadmin depend on the **relevant T040 auth foundation**; operational tenant activation also requires T041/T042. Sequence work to avoid a circular dependency: build superadmin shell and auth first, then approval workflow.
- V1 release gate `T013` / `LEG-007` must include T040–T042 and relevant LEG-012 review. Landing T043 is a **separate final launch gate**, not a prerequisite to developing/testing menus.
- `T014` payment gateway and `T015` AI credits remain **FUTURE**. **Do not implement T014 in V1**; future gateway must not automatically bypass manual approval without a new ADR.
- `T000` remains open for license duration, price, merchant approval policy, hosting and IdP account audience. Hostnames are already resolved.

## v7 — Brand design system, café/restaurant onboarding and theme inventory (2026-10-25)
| ID | Phase | Task | Dependencies | Acceptance evidence | Status |
|---|---|---|---|---|---|
| T044 | V1 early UI foundation | Implement shared QMenuX brand tokens and mobile admin/superadmin component library | T001 | BRAND-001..004, accessible 320/375/430px review | TODO |
| T045 | V1 | Business-type selector, optional starter categories and recommended public theme; draft-only, editable, skip | T003,T005,T041,T042,T044 | ONB-003..005, tenant isolation and no auto-publish | TODO |
| T046 | V1 | Theme registry contracts and ten-theme content/accessibility regression matrix | T008,T020,T044 | THEME-002 for all 10 themes and café/restaurant samples | TODO |

### Dependency and release-gate notes
- T006/T011 frontend should consume T044 shared components; this is a UI dependency, not a blocker for early backend/identity work.
- T020 remains responsible for **implementing ten public themes**. T046 supplies the acceptance matrix; it does not add ten more themes.
- T013 and LEG-007 must include T044–T046 where applicable. T043 remains the **last marketing/landing UI task** and reuses T044 tokens.
- T000 business-type categories/branding resolved; license term/price, hosting and provider audience still open. Do not mark T000 done.


## v8 — Neon PostgreSQL + Vercel deployment tasks (2026-10-25)
| ID | Release | Task | Dependencies | Acceptance evidence | Status |
|---|---|---|---|---|---|
| T047 | V1 foundation | Vercel monorepo projects + Next.js/NestJS Functions spike; choose ORM after test | T001 | INFRA-001, cold-start and bundling report | IN_PROGRESS |
| T048 | V1 foundation | Neon project/branches, pooled runtime/direct migration URLs, RLS transaction-context tests | T002,T003,T047 | INFRA-002, parallel tenant isolation tests | TODO |
| T049 | V1 before async features | Choose external worker host + BullMQ-compatible Redis/queue; deploy durable job consumer/outbox relay | T047,T048 | INFRA-003, retries/idempotency/queue recovery | TODO |
| T050 | V1 | Configure Vercel hostnames, Cloudflare DNS/TLS/WAF/Access and wildcard tenant routing | T035,T047 | INFRA-004, reserved-host and mobile Access tests | TODO |
| T051 | V1 release gate | Vercel preview/staging/prod secrets and Neon isolation, backup/PITR/restore drills, observability | T048,T049,T050 | INFRA-005, restore evidence | TODO |

### v8 precedence and dependency corrections
- T000 now has **Neon PostgreSQL** and **Vercel** decided; **worker host, Redis provider, ORM, region and Vercel plan remain OPEN**. Do not mark T000 complete.
- T002/T003 must be implemented with Neon transaction-pooling/RLS requirements; T047/T048 are early engineering spikes, not late deployment tasks.
- T018 PDF, T027 imports, T031 scheduled menus, T034 notifications and future T024 AI depend on T049 before production activation.
- T013 production deployment and LEG-007 release gates depend on T047–T051. T043 marketing landing remains LAST. Payment gateway T014 remains FUTURE, not V1.
- No task is DONE; implementation, vendor configuration and legal review remain outstanding.

## v9 — Git governance and CI (2026-10-25)
| ID | Release | Task | Dependencies | Acceptance evidence | Status |
|---|---|---|---|---|---|
| T052 | V1 foundation | Adopt Git workflow in existing repository, preserve history, validate `.gitignore`, establish reviewed docs baseline | T000 documentation review | GIT-001: existing history intact; clean scoped baseline; no secrets; branch policy documented | TODO |
| T053 | V1 early engineering | Implement GitHub Actions lint/typecheck/test/build and secret scan with PR protection recommendations | T001,T052 | GIT-002: CI workflow actually runs; required checks documented; no production secrets in PR CI | IN_REVIEW |

### v9 execution constraints
- T052 is repository governance and should be addressed before coding T001. It **does not** mean reinitialize an existing Git repository.
- T053 can be implemented once project scripts exist; do not mark complete based on YAML alone.
- Every task must report Git branch, reviewed diff, test evidence and commit hash or `not committed`.
- Commits, pushes and merges require explicit user authorization. T043 marketing landing stays LAST.

## T001 execution contract — local-only exception, 2026-10-25
- Owner: Engineering; reviewer: pending. Status: IN_REVIEW, not DONE. User explicitly approved local scaffolding while T000/legal decisions remain open; [decision evidence](../02-architecture/DECISIONS.md#t001-local-only-foundation-exception--2026-10-25).
- Objective: runnable local pnpm/Turborepo foundation without production services, tenant data or active commercial/auth features.
- Branch/base: `feat/T001-monorepo-setup` from clean local `main` at `111542c`; existing documentation branch preserved, no merge. No commit/push authorized.
- Files: root workspace/lockfile/Turbo/lint/test configuration, `.gitignore`, `.node-version`, `.env.example`; `packages/config`; `apps/menu-pwa`, `apps/admin-pwa`, `apps/superadmin-pwa`, `apps/api`; browser tests; README and TASKS/ROADMAP/DECISIONS/PROGRESS evidence.
- Steps: inspect Git/tool versions; create branch; pin compatible dependencies; create minimal shells/API; install; verify frozen install, lint, types, HTTP/browser smoke, builds and audit; inspect diff/ignore/secrets; report limits.
- Acceptance: local commands pass; health exposes only liveness and no private configuration; no business/checkout endpoints; all shells handle 320/375/390/430px; real CI green and reviewer evidence required before DONE. T053 remains TODO, not satisfied by local scripts.
- Tests: `apps/api/test/health.test.ts`, `tests/scaffold.spec.ts`; actual results and failures/fixes in [PROGRESS.md](PROGRESS.md#t001-local-scaffold--2026-10-25).
- Rollback: reverse only T001 files after checking for subsequent user edits; generated outputs can be discarded independently. No data/migration/service rollback needed; no Git reset or history rewrite.
- Open: T000/legal/feature gates, real CI, ESLint dependency compatibility follow-up and T047 deployment/ORM proof. Tenant isolation is not implemented and must not be claimed tested.

## T053 execution contract — 2026-10-25
- Owner: Engineering; reviewer/name/date: pending. Status: IN_REVIEW, not DONE; hosted runs passed, named/dated reviewer acceptance pending.
- Scope authorized: prepare CI locally after user requested next step; no commit, push, PR creation, branch protection or production access authorized.
- Branch/base: continued clean `feat/T001-monorepo-setup` at user-created `d5465d5` as one cohesive T001/T053 foundation acceptance unit; no new branch or merge. T001 CI acceptance is not marked satisfied. Existing docs branch preserved.
- Dependencies: runnable T001 scripts exist; T052 Git policy applies, formal task/reviewer closure not inferred from commits. T000/legal gates remain unchanged under local foundation scope.
- Files: `.github/workflows/ci.yml`, `playwright.config.ts` (`forbidOnly`), README.md, GIT_WORKFLOW.md, this file and PROGRESS.md. No app, dependency version, lockfile or schema change.
- Steps: inspect Git/docs/tool versions; verify official action SHAs/scanner checksums; prepare least-privilege quality/history-scan jobs; validate YAML and scanner positive/negative behavior; execute local CI-mode quality commands; document required checks and missing remote evidence.
- Acceptance: workflow actually runs on an authorized PR/test branch with lint/typecheck/API+browser tests/build/audit/secret-scan evidence; no production secrets; required-check recommendations and named reviewer acceptance. Local YAML/scripts alone do not satisfy GIT-002.
- Tests/evidence: [T053 progress record](PROGRESS.md#t053-ci-preparation--2026-10-25); workflow lint, redacted history/source scans, transient synthetic-secret rejection and focused-test rejection; frozen install and all quality scripts in CI mode.
- Rollback: remove/reverse only T053 changes after checking for later user edits; coordinate any future required-check settings with owner; no data migration/history rewrite.
- Commit: not committed, index unchanged. Proposed commit: `ci(T053): validate pull requests and scan secrets`.
- Next: reviewer acceptance and owner-configured branch protection/review policy; no automatic merge. Hosted evidence is recorded below. T047 isolated hosting/ORM proof follows foundation acceptance and separate service authorization.

## T053 hosted CI evidence — 2026-10-25
- Tested commit: `a7cc4b9a06aa38798605ec7c344e5275230f71fd`, branch `feat/T001-monorepo-setup`, [PR #1](https://github.com/semih-turan/qmenux/pull/1).
- [PR CI](https://github.com/semih-turan/qmenux/actions/runs/40195730650): SUCCESS; Quality and Secret scan both passed. [Push CI](https://github.com/semih-turan/qmenux/actions/runs/40195729972): SUCCESS; both jobs passed.
- Hosted environment: Ubuntu 24.04.5, runner 2.338.0, Node 24.22.1 and pnpm 10.29.2. Locked install, audit, 5 lint tasks, 4 app typechecks, Chromium/OS installation, 1 API + 3 browser tests and 4 builds passed. No production credentials configured in the workflow.
- Evidence inspection: `gh run view`, `gh run watch --exit-status`, filtered job logs and read-only PR/branch API queries; detailed record in [PROGRESS.md](PROGRESS.md#t053-hosted-ci-evidence--2026-10-25).
- Reviewer gate: GitHub PR reviews list empty at inspection; no named/dated acceptance inferred. T053 and T001 remain IN_REVIEW, not DONE. Main reports `protected: false`, applicable branch rules empty; recommendations are not enforced.
- Publication: CI commit was already present locally/remotely when this turn began; no duplicate agent commit/push. This evidence update is uncommitted. No merge, rule change or deployment performed.

## T047 execution contract — 2026-10-25
- Owner: Engineering; reviewer/date: pending. Status: IN_PROGRESS, not DONE. User requested T047 and explicitly approved a dependent branch from unmerged `d9b2df4`; [scope/evidence report](../08-operations/T047_SPIKE_REPORT.md).
- Branch: `feat/T047-vercel-nestjs-spike`; existing foundation/docs branches, default branch, remote configuration and history preserved. No merge, commit or push authorized/performed.
- Objective: native Vercel monorepo/Next/Nest proof plus evidence-based ORM proposal, without feature/business flows or production services.
- Files: root package.json/pnpm-lock.yaml (development trace tool/scripts); `infrastructure/spikes/trace-api.mjs`; isolated `infrastructure/spikes/orm` workspace/schema/probe/lifecycle script/README/lockfile; README, this backlog, PROGRESS, DECISIONS, ROADMAP and infrastructure spike report.
- Local steps: verify docs/runtime/tools; create authorized branch; trace/copy/start API; install isolated stable ORM candidates; use disposable local socket-only PostgreSQL to verify typed-query RLS/rollback/pool-reuse behavior; run lint/typecheck/tests/build/audits; record limitations and concrete Preview project plan.
- Local evidence: 1,093 traced files/2,865,850 bytes; copied API starts and answers 20 concurrent health requests. Both ORM candidates pass missing-context/cross-tenant denial, own-write rollback and 20 alternating-tenant transactions through one reused backend. This is not Vercel cold-start or Neon/PgBouncer proof.
- Acceptance still required: isolated Vercel Next.js/NestJS Preview execution, recorded cloud bundling/cold-start/concurrency/limits report, reviewed ORM decision and named/dated acceptance. No task completed on local metrics alone. T048 Neon pool proof remains separate.
- Cloud action: owner declined project creation/deployment on 2026-10-25 (“Hayır, şimdilik yalnızca yerel deneme”). Local scope only; Preview plan deferred, no pending approval question. No creation/deployment/env pull performed; future cloud execution requires new explicit authorization.
- Rollback: remove only T047 tooling/spikes after checking for later user edits; local cluster/artifact clean themselves up. No canonical DB schema, application runtime or live data changed. Future preview resource lifecycle must be recorded separately.
- Tests: actual results in [PROGRESS.md](PROGRESS.md#t047-local-spike--2026-10-25). Root CI only lints experiment source; local DB test has an explicit separate command.
- Commit: not committed; index unchanged. Proposed later commit after review: `chore(T047): add isolated runtime and ORM probes`.

### T047 scope clarification — 2026-10-25
Local experiment work and checks are prepared for review. Owner explicitly limited the task to local experiments; cloud acceptance is deferred, not satisfied or waived. Keep T047 IN_PROGRESS and ORM OPEN. No additional cloud access or repeated approval request is needed during this local-only scope. Next permitted action is local review; commits/pushes remain separately authorized.
