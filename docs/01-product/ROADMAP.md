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

## T052 review checkpoint — 2026-10-25
- Existing documentation baseline is now tracked at `111542c`; T052 ignore rules and evidence await reviewer acceptance and separately authorized commit. No fresh initial documentation commit is needed.
- T052 precedes T001; T000 and LEG-001–005 gates remain in force. T052 authorization does not authorize application scaffolding or waive legal gates.
- Proposed dependency clarifications (not yet approved task changes): T001 local scaffold/scripts → T053 real PR CI; T047 before ORM-dependent T002 → T003 → T048. See [review findings](../02-architecture/DECISIONS.md#t052-review-findings--2026-10-25).
- Existing binding order remains: auth/shared management UI early; superadmin approval/manual licensing before tenant operation; T049 before async feature activation; V1 features and release gates before T043 landing; payments/AI remain future.
