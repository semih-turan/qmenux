# Restricted MVP pilot — T050

Owner scope, 2026-10-26: protected menu preview and tenant/operator login screens. No real social sign-in, public customer launch, payments or background worker acceptance is claimed.

## Environment

- Dedicated Vercel projects: `qmenux-pilot-api`, `qmenux-pilot-menu`, `qmenux-pilot-admin`, `qmenux-pilot-ops`. Roots: `apps/api`, `apps/menu`, `apps/admin`, `apps/ops`; Node 24.x; workspace sources outside the root included. Deploy only to Preview; keep Vercel Authentication enabled. Do not promote or assign canonical production domains.
- Dedicated Neon database `qmenux_pilot_20261026`, accessed through a dedicated NOINHERIT/NOBYPASSRLS login and transaction-local application roles. The existing development `neondb` and old schema are unchanged. The owner/direct URL is local migration tooling only; API receives only the pooled runtime URL. Frontends receive no database credentials.
- Pilot-specific token pepper, encryption key and BFF key. Server-to-server requests to the protected pilot API use a pilot-project automation bypass secret in `QX_API_PROTECTION_BYPASS`. Store secrets in Preview secret variables only; never put them in NEXT_PUBLIC, logs, browser code or URLs. Individual project QA tokens stay local/Vercel; they are not shared in chat.
- Menu mapping: `QX_PREVIEW_MENU_SLUG=demo-kahve`, `VERCEL_ENV=preview`, and exact platform-issued immutable `VERCEL_URL`. No query parameter, browser-supplied tenant id or forwarded host can select the preview tenant. Normal production host routing is unchanged.
- Fictional demo data only, visibly labelled Pilot/Test. No verified allergen/nutrition claim. Real providers are disabled; login screens truthfully report that no provider is configured. Do not enable the mock IdP on Vercel.

## Acceptance and rollback

1. Local lint, typecheck, tests, build, dependency audit and secret scan pass; CI must pass on the final PR head.
2. Each immutable deployment URL refuses anonymous requests (401 / Vercel Authentication). Authorised menu and both login pages return 200; protected API public demo read succeeds, private admin/operator endpoints refuse missing sessions.
3. Check menu/login layout at 320/375/390/430 px; record the browser/HTTP evidence and exact deployment URLs in PROGRESS.md after validation. Real device, provider OIDC and worker tests remain pending.
4. Revoke pilot bypass credentials and disable pilot deployments if needed. Revert the preview adapter commit to undo code; production settings need no rollback. Retain the isolated pilot DB until the owner authorises deletion; never drop/reset the existing development/production databases. No shared-schema migration rollback is needed.
