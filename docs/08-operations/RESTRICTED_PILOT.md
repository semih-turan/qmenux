# Restricted MVP pilot — T050

Owner scope, 2026-10-26: protected menu preview and tenant/operator login screens. No real social sign-in, public customer launch, payments or background worker acceptance is claimed.

## Environment

- Dedicated Vercel projects: `qmenux-pilot-api`, `qmenux-pilot-menu`, `qmenux-pilot-admin`, `qmenux-pilot-ops`. Roots: `apps/api`, `apps/menu`, `apps/admin`, `apps/ops`; Node 24.x; workspace sources outside the root included. Use the explicit Vercel staging/Preview target; keep Vercel Authentication set to All Deployments (existing Pro plan, no plan/add-on change). Do not promote or assign canonical production domains.
- Dedicated Neon database `qmenux_pilot_20261026`, accessed through a dedicated NOINHERIT/NOBYPASSRLS login and transaction-local application roles. The existing development `neondb` and old schema are unchanged. The owner/direct URL is local migration tooling only; API receives only the pooled runtime URL. Frontends receive no database credentials.
- Pilot-specific token pepper, encryption key and BFF key. Server-to-server requests to the protected pilot API use a pilot-project automation bypass secret in `QX_API_PROTECTION_BYPASS`. Store secrets in Preview secret variables only; never put them in NEXT_PUBLIC, logs, browser code or URLs. Individual project QA tokens stay local/Vercel; they are not shared in chat.
- Menu mapping: `QX_PREVIEW_MENU_SLUG=demo-kahve`, `VERCEL_ENV=preview`, and exact platform-issued immutable `VERCEL_URL`. No query parameter, browser-supplied tenant id or forwarded host can select the preview tenant. Normal production host routing is unchanged.
- Fictional demo data only, visibly labelled Pilot/Test. No verified allergen/nutrition claim. Real providers are disabled; login screens truthfully report that no provider is configured. Do not enable the mock IdP on Vercel.

## Acceptance and rollback

1. Local lint, typecheck, tests, build, dependency audit and secret scan pass; CI must pass on the final PR head.
2. Each immutable deployment URL refuses anonymous requests (401 or redirect to Vercel Authentication). Authorised menu and both login pages return 200; protected API public demo read succeeds, private admin/operator endpoints refuse missing sessions.
3. Check menu/login layout at 320/375/390/430 px; record the browser/HTTP evidence and exact deployment URLs in PROGRESS.md after validation. Real device, provider OIDC and worker tests remain pending.
4. Revoke pilot bypass credentials and disable pilot deployments if needed. Revert the preview adapter commit to undo code; production settings need no rollback. Retain the isolated pilot DB until the owner authorises deletion; never drop/reset the existing development/production databases. No shared-schema migration rollback is needed.

## Verified pilot — 2026-10-26

The API uses the existing compiled stateless handler (`src/vercel.ts`) through `api/index.mjs`, `framework: null`, a public robots file and rewrites in `apps/api/vercel.json`. Build contracts/database/API before function tracing. This avoids native Nest source compilation interpreting the shared tsconfig differently. The native-only slug narrowing error was also fixed with an explicit false discriminant; no auth/onboarding behavior changed.

Initial empty frontend bootstrap deployments were automatically classified as Production by Vercel before Preview variables were available. They served no pilot data, were protected, and were removed after explicit staging deployments succeeded. Original production projects/domains/configuration remain untouched. Keep explicit staging targets for future pilot redeploys.

- menu: [https://qmenux-pilot-menu-frxix3d4t-semihs-projects-fff996f3.vercel.app](https://qmenux-pilot-menu-frxix3d4t-semihs-projects-fff996f3.vercel.app) (`dpl_J5w33HZpQWEFpDwwHXmsWToXYR5z`)
- admin: [https://qmenux-pilot-admin-dc30zm26q-semihs-projects-fff996f3.vercel.app](https://qmenux-pilot-admin-dc30zm26q-semihs-projects-fff996f3.vercel.app/login) (`dpl_GZJJk61pasVpvKmPT497erVnikfK`)
- ops: [https://qmenux-pilot-mm1xht918-semihs-projects-fff996f3.vercel.app](https://qmenux-pilot-mm1xht918-semihs-projects-fff996f3.vercel.app/login) (`dpl_H9asfnUqPwHUJV3nv5weScJcnRW8`)
- api: [https://qmenux-pilot-olyxroq2l-semihs-projects-fff996f3.vercel.app](https://qmenux-pilot-olyxroq2l-semihs-projects-fff996f3.vercel.app) (`dpl_GhmidNN3B9L4Euzt8vJFygtcu6Jm`)

All four validated deployments are READY, staging/Preview, with Vercel Authentication across all URL scopes. Anonymous requests redirect to Vercel login (302); authorised menu and both login pages return 200. The API returns `providers: []`, the demo public read is OK with three categories, sessionless `/v1/me` and `/v1/control/stats` return 401, and the mock IdP returns 404. No real login is claimed.

Chromium screenshots and assertions passed at 320/375/390/430 px for all three pages: correct content and no horizontal overflow. Keyboard skip navigation and menu search passed at 375 px. Local screenshots/results are in `.local/pilot-qa/` (ignored). Local tests: 275 pass; API's 31 tests rerun after the compiler narrowing fix. GitHub CI passed on application head `3b9c708`; final documentation/metadata commit checks are linked from PR #3. Real iOS/Android hardware, real OIDC, image storage, PDF worker and production/legal gates remain unverified/out of scope.
