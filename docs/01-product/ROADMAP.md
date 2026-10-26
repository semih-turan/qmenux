# Delivery Roadmap

> Status: Draft v0.1 | Date: 2026-10-25 | Owner: Product/Engineering | Review before production.

## Milestones and gates
### M0 Discovery and compliance sign-off
Decide brand/domain, license interval/price, merchant entity, legal rules inventory, privacy notices, sample data and UX journeys. Gate: PRD and acceptance criteria approved.
### M1 Foundation
Monorepo, CI, auth, tenant context, RLS, observability, domain routing, admin shell. Gate: cross-tenant integration tests pass.
### M2 Menu MVP
CRUD, photo pipeline, theme renderer, QR and print output, public PWA, mobile admin flows. Gate: owner completes 5 top workflows on iPhone and Android.
### M3 Commercial V1
Subscription lifecycle, manual renewals, admin control, alerts, audit and compliance review. Gate: license expiry and restoration scenarios tested.
### M4 Billing integration
Provider port, one gateway adapter, callback verification, ledger, reconciliation, refund policy. Gate: sandbox end-to-end payment and duplicate webhook tests.
### M5 AI add-on
Wallet/ledger, queue, image and text adapters, human approval, nutrition provenance. Gate: no unapproved safety-related claims published.

## Release strategy
Feature flags, staged tenants, database backward-compatible migrations, monitoring, backup restore drills and rollback plans. No automatic launch of features just because code compiles.

## Legal gate refinement
T000 and LEG-001..005 precede core implementation. LEG-006 and LEG-007 are required before commercial launch. Future payments and AI require LEG-008 re-review. See TASKS.md for dependency graph.

## Scope update — V1 vs later
V1 MUST include: mobile-only-complete admin UX; geo visibility controls; optional Wi-Fi; ten public themes; one active image per product; total/month QR counters; A4 menu PDF and separate allergen PDF; license remaining. AI UX hooks can appear disabled but must not charge or imply feature is operational.
V2 adds optional AI credits, price quotes, image/text/nutrition/allergen draft generation and human approval. No separate feature-tier subscription.

## v4 scope assignment
**V1:** sold-out/hidden products, version history/restore, mobile CSV/XLSX import, public search/filters, table QR codes. **V1.5:** multilingual menus, scheduled menus/prices, expanded anonymous analytics, optional WhatsApp CTA, PWA push. This assignment may be revised in T000 with signed ADR; V1 release gate must not silently include V1.5. Shared schema/API foundations may be introduced earlier. Future AI remains credit-funded.

## QMenuX domain and integration rollout
V1: canonical DNS/routing, secure distinct PWA sessions, superadmin Access/MFA, versioned first-party API, reserved tenant slugs, basic API threat model and contract tests. Later controlled milestone: tenant integration credential management, external developer access and webhooks. Telegram and WhatsApp Business adapters remain future work and must pass provider/legal review. No external access is assumed live merely because api.qmenux.com exists.


## v6 explicit implementation order
1. Foundation: auth/identity, tenant isolation, provider-ready OIDC, manual approval and license entitlement.
2. **First product UI:** public customer menu and tenant mobile admin; superadmin mobile PWA and approval controls.
3. Feature completion, security, legal tests and pilot operation.
4. **Last UI:** `qmenux.com` marketing landing, Login/Sign up entry, SEO and legal marketing pages. Minimal auth pages needed for earlier testing are not the finished landing.
5. **Later:** PayTR/other payment gateway, self-service billing and AI credits only after new signed decision and provider/legal review.
Do not treat M4 Billing as V1. Approval is a superadmin action, not payment status.

## v7 sequencing
- T044 shared brand/admin design tokens is an early frontend foundation; do not wait for landing.
- T045 business-type onboarding recommendations follow tenant/approval/catalog foundation.
- T046 public theme matrix supports T020 ten-theme delivery, not a separate set of ten more themes.
- T043 marketing landing remains LAST and must reuse approved brand tokens.


## v8 infrastructure delivery dependencies
- Foundation before product work: Vercel monorepo preview deployments and Neon dev/staging/prod isolation; NestJS-on-Vercel proof-of-concept; pooled/direct connection and RLS transaction tests.
- Select durable worker hosting and compatible Redis/queue before scheduling/PDF/AI/import features are considered operational.
- Vercel/Neon production release, restore drills, security gates and mobile PWA tests precede marketing landing. T043 remains LAST.

## v9 Git execution sequencing
Before T001 implementation, complete T052: inspect the existing Git repository, safely incorporate documentation and ignore rules, and request authorization for a baseline commit. T053 follows T001 once runnable scripts exist. Each subsequent task uses a reviewed task branch; default branch remains stable. Do not delay foundational backend work solely to build marketing landing (T043 remains last).

## Authorized local T001 work — 2026-10-25
The owner explicitly allowed local monorepo scaffolding while T000/legal reviews remain open. This bounded exception covers tooling, placeholder application shells, liveness and local checks only. It does not authorize feature work, production services or legal approval. T001 CI-green acceptance remains pending T053 execution/review; T047 hosting/ORM proof follows the local foundation. Marketing T043 stays last and V1 payments remain disabled.

## T047 local evidence checkpoint — 2026-10-25
Local runtime tracing and disposable PostgreSQL ORM comparison are in progress on an explicitly approved dependent branch. Both candidates pass the local transaction/RLS probe; ORM is still OPEN. Native Vercel Preview execution and reviewer acceptance remain required for T047; Neon/PgBouncer validation remains T048. No feature work, production setup or landing implementation is advanced by these experiments. See [T047 report](../08-operations/T047_SPIKE_REPORT.md).

T047 scope clarification (2026-10-25): owner limited work to local experiments and declined the new Preview projects. Local results are ready for review; cloud execution is deferred. T047 remains incomplete under its unchanged acceptance criteria. No further cloud action until new explicit authorization.

## Vercel-managed Neon development evidence — 2026-10-25
Later owner instructions authorized direct CLI Production-target development and completing the remaining infrastructure steps. Existing qmenux-api now has uncached database readiness against isolated qmenux-dev using only the restricted runtime credential. Synthetic pooled non-owner RLS reads/writes, overlapping transactions and direct migration rollback passed; all test fixtures were removed. T048 is IN_PROGRESS; application schema/auth/RLS integration (T002/T003), ORM/reviewer decisions, environment/restore/legal release gates and pilot acceptance remain open. Provider Production targeting does not waive these gates. Continue with the core data/identity/menu/admin sequence; T043 marketing landing remains last and V1 payments remain disabled. [Evidence](PROGRESS.md#pooled-rls-direct-migrations-and-api-readiness--2026-10-25).

## Tenant transaction checkpoint — 2026-10-25
T002 baseline is imported into the owner-approved dependent T003 branch. Local real-PostgreSQL and manual isolated Neon application-schema isolation tests pass; existing Vercel API remains health-only. T002/T003/T048 remain IN_PROGRESS pending review and remaining acceptance. Next implement T004 identity/RBAC/MFA before catalog routes, with secure provider protocols and explicit privileged activation/license gates. T043 stays last; no V1 payment integration. [Evidence](PROGRESS.md#t003-tenant-resolution-and-transaction-isolation--2026-10-25).

## Identity development checkpoint — 2026-10-25
T004 IN_PROGRESS: Google code/PKCE validation and durable revocable API sessions implemented and tested with signed synthetic provider responses plus private local/Neon PostgreSQL. Vercel provider configuration remains disabled; registration creates no tenant privileges/license. Next T004 slices are membership/RBAC and privileged Access/MFA, Microsoft/Apple adapters, admin mobile BFF and provider/security/privacy/abuse/retention acceptance. T005 remains dependent on reviewed identity/authorization. T043 stays last; no V1 payment gateway.

## Membership authorization checkpoint — 2026-10-25
T004 now includes an internal OWNER/EDITOR membership/permission boundary with mandatory entitlement and session revocation after authorization changes. No private business endpoint, membership mutation or license entitlement implementation is enabled. Continue separate operator audience/Access/MFA and remaining identity/mobile/provider gates before T005; T004 remains IN_PROGRESS pending review. T043 landing remains last; no V1 payments.

## T041 → T010/T042 handoff proposal —2026-10-26

Current0022 approval is a pre-tenant decision. The next dependency-aware slices are [defined in the provisioning/license contract](../04-backend/TENANT_PROVISIONING_AND_LICENSE_CONTRACT.md):
1. Review the docs-only proposed ADR026 and security/rollback/test boundaries.
2. Separately requested local inactive provisioning: new purpose-specific operator capability, approved-application mapping, inactive tenant/one initial branch and OWNER-PENDING via module-owned contracts. Actual native/PG isolation/atomicity evidence; no license/access or production route.
3. Resolve coverage/branch count, amount/term and grace/public-read/future-start policy; implement T010/T042 separate manual grant/current entitlement and atomic effective activation.
4. Reviewed mobile transport/confirmation/recovery, actual provider/device/hosted and named security/privacy/legal/restore evidence before privileged enablement. T043 marketing remains last; V1 payments stay absent.

Approval/provisioning/grant are separate explicit actions; existing ordinary membership creation revokes old sessions. This proposal introduces no new infrastructure or commercial default, and marks no task DONE. Inactive provisioning can be independently tested without selecting license coverage; real licensed activation cannot.

## T041 inactive provisioning local delivery —2026-10-26

The separately requested0023 internal slice now verifies purpose-bound inactive tenant/initial branch/OWNER-PENDING creation, immutable receipt/replay and same-transaction rollback/session revocation using real local native signatures/PostgreSQL. No provisioning transport/mobile UI/route, cloud migration or license/ACTIVE transition is enabled. Next independent slice can prepare the reviewed provisioning transport/mobile confirmation/result recovery; T010/T042 license schema/grant/current entitlement still requires explicit commercial coverage/policy decisions. Both remain real-user/provider/device/security/privacy/legal/recovery/restore review-gated. [Precise current evidence](../04-backend/TENANT_PROVISIONING_AND_LICENSE_CONTRACT.md#local-inactive-provisioning-delivery-0023-2026-10-26). T043 remains last; no V1 payments.
