# Progress Log

> Status: Draft v0.1 | Date: 2026-10-25 | Owner: Product/Engineering | Review before production.

## Current status — 2026-10-25
Documentation baseline drafted. No application implementation, legal sign-off, provider integration, tests or deployment has been completed by this deliverable.

## Next
1. Confirm unresolved product decisions in README.
2. Validate official Türkiye compliance requirements with qualified counsel.
3. Approve architecture ADRs and start T001.

## Session update template
- Date / agent:
- Task:
- Files changed:
- Tests executed (actual output):
- Open risks:
- Next task:

## 2026-10-25 Documentation update
Added task-first backlog, legal requirements register, legal operations, legal document specifications, compliance test matrix and release legal checklist. No implementation tasks or legal approvals have been completed. Next: T000.

## 2026-10-25 scope change
Requirements and tasks added: T016–T022, LEG-009, T024. All remain TODO/FUTURE; no implementation or legal review is claimed complete. New traceability and design specifications added.

## v4 update — 2026-10-25
Documentation only: T025–T034 and LEG-010 created, all TODO. No application code, test execution or legal approval claimed. V1/V1.5 split is proposed and must be confirmed during T000.

## 2026-10-25 v5 documentation-only update
QMenuX name and hostname decisions incorporated across docs. Added T035–T039 and LEG-011; architecture, API, security, mobile PWA, deployment, testing and legal workstreams expanded. All implementation tasks remain TODO/FUTURE; no DNS, Cloudflare Access, external API or provider integration has been deployed or verified.


## 2026-10-25 v6 requirements amendment
Added identity and approval specs, landing-last policy, and future-only payment gate. T040–T043 and LEG-012 added as TODO; no implementation, provider setup, payment connection or legal approval is claimed.

## 2026-10-25 v7
Brand positioning, color tokens, ten public theme briefs and editable café/restaurant onboarding documented. T044–T046 added as TODO. No UI code or screenshots in this ZIP; implementation/test status unchanged.


## 2026-10-25 v8 — Infrastructure selection
Confirmed Neon PostgreSQL and Vercel deployment for Next.js apps and stateless NestJS API. Added `VERCEL_NEON_INFRASTRUCTURE.md` and `DEPLOYMENT_DECISIONS.md`; tasks T047–T051 remain TODO. External worker host, Redis/queue vendor, ORM, regions and Vercel plan are still open. No actual deployment, DB provisioning or testing claimed.

## 2026-10-25 v9
Git governance policy and root `.gitignore` template documented. Added T052 (repository baseline) and T053 (CI) as TODO. No Git operations were performed on the user's actual repository; no branches, commits, remote settings or CI workflows have been created or verified.

## 2026-10-26 implementation session — agent-recorded (Claude Code), NOT reviewer-approved
- **Date / agent:** 2026-10-26, coding agent on explicit user request ("dokümanlara göre geliştir, bitince gerçek insan gibi test et"). No Git repository exists in the working copy; nothing was committed or pushed.
- **Tasks touched (all remain TODO until reviewer sign-off):** T011/T036/T041/T042 (superadmin PWA `apps/ops`), T018/T049 (PDF worker `apps/worker`), T053 (CI workflow), T044 (shared UI helpers moved from admin to `@qmenux/ui`).
- **Files added:** `apps/ops/**` (operator PWA on `superman.<root>`: OIDC login → mandatory TOTP step → overview, tenants, licences, alerts, applications, audit), `apps/worker/**` (outbox consumer + A4 menu/allergen PDF renderer, pdfkit + Geist font), `packages/database/migrations/0003_worker_pdf_grants.*`, `.github/workflows/ci.yml`.
- **Files changed:** `apps/api/src/ops/ops.controller.ts` (audit cursor is an id, not a datetime), `apps/api/src/storage.ts` + `public.controller.ts` (PDF objects, never served publicly), `apps/api/src/admin/admin.controller.ts` (`GET /v1/admin/exports/:id/file`), `packages/database/src/repos/settings.ts` (`pdfExportFileKey`), `apps/admin/.../more/exports/page.tsx` (İndir), admin BFF forwards `content-disposition`, `packages/ui/src/styles/components.css` (shared helpers).
- **Tests executed (actual):** `@qmenux/ops` vitest 20/20 passed; `@qmenux/worker` vitest 4/4 passed; `next typegen && tsc --noEmit` and `eslint` clean for ops; API `tsc` build clean. Full `turbo run lint typecheck test` result is recorded in the session report (see chat); re-run before review.
- **Manual QA (Playwright, 320/375/1280):** ops login refuses non-operators (FORBIDDEN); wrong TOTP → MFA_INVALID; 6th wrong code → 429 RATE_LIMITED; CSRF without header → 403; ops token on admin BFF and on `/v1/me` → 401; PLATFORM_SUPPORT sees read-only screens and the API returns 403 on mutation; licence extend (step-up TOTP) starts after the current period; revoke/suspend/unsuspend/approve/reject all audited with reasons; approved tenant goes ACTIVE only after a grant (public menu 404 → NOT_PUBLISHED). PDF: request → worker → READY → download (`application/pdf`, 14–15 KB). Screenshots in `.playwright-mcp/ops-*.png`, `admin-exports-ready-375.png`, sample PDFs `menu-a4.pdf`, `allergen-a4.pdf`.
- **Open risks:** worker writes to the API's local media dir (R2 not wired, D-API-04); no Cloudflare Access in front of `superman` (deployment item, OD-17); TOTP enrolment is CLI-only, no passkey (OD-15); unknown DB errors surface as generic 500 (e.g. invalid slug from a hand-seeded application); CSV/XLSX import (T027) and landing (T043) not implemented; real OIDC providers unconfigured.
- **Local dev data created during QA (dev DB only):** tenant `mahalle-firini-sube-2` (approved + 1-month licence), rejected application `ay-bufe`, one revoked planned grant on `demo-kahve`.
- **Next task:** reviewer pass on `apps/ops` and `apps/worker`; then T027 import, T043 landing, T050 Cloudflare Access.

## 2026-10-26 (evening) — T027 import + T043 landing — agent-recorded, NOT reviewer-approved
- **Files added:** `apps/api/src/admin/import-parse.ts` (CSV/XLSX parsing, Turkish price parsing, sanitising, mapping, dry-run validation), `apps/api/src/admin/imports.controller.ts` (`/v1/admin/imports`: upload, preview, remap, apply, discard, template.csv), `packages/database/src/repos/imports.ts` (batches, draft commit with duplicate policy), `apps/admin/src/app/(app)/more/import/page.tsx`, `apps/landing/**` (qmenux.com: home, özellikler, nasıl çalışır, temalar, fiyatlandırma, SSS, iletişim, four legal DRAFT pages, /giris → admin login redirect, /kayit, robots, sitemap), `apps/api/test/import-parse.test.ts`, `apps/landing/test/site.test.ts`.
- **Files changed:** `apps/api/src/app.ts` (raw body for CSV/XLSX on `/v1/admin/imports`, controller registered), `apps/admin/src/lib/bff-policy.ts` (sheet content types; one file extension allowed in path segments for `template.csv`), admin More page link, admin types, `admin.css` (`.qx-scroll-x`). Dependency added: `exceljs` (API).
- **Tests executed (actual):** `turbo run lint typecheck test` → 29/29 tasks OK; vitest totals: contracts 22, ui 70, ops 20, landing 2, menu 59, admin 19, database 42, worker 5, api 31 (import parser: delimiter sniffing, quotes, BOM, Turkish prices incl. "1.250,00"/"1,250", formula cells read as cached results only, header auto-mapping, duplicate rows, error messages).
- **Manual QA (Playwright 375/1280):** CSV with BOM, `;` delimiter, emoji category, duplicate row, empty category, >120-char name, unreadable price and `=HESAP()` → 8 rows / 4 valid / 4 errors with Turkish messages; apply → "3 yeni, 1 güncellenen ürün, 1 yeni kategori"; XLSX (formula cell, number cell, "420,00") → 3 valid, apply with "Atla" → 3 new products, 2 categories; categories visible in admin Menü as DRAFT (not published). Landing: every route 200, `/giris` 307 → admin login, no horizontal overflow at 375, mobile `<details>` menu works without JS, legal pages labelled "Taslak — hukuki inceleme bekliyor", no price invented (OPEN decision), no tracking/cookies. Screenshots: `.playwright-mcp/admin-import-*.png`, `landing-*.png`.
- **Open risks:** landing contact is e-mail only (no form/spam defence yet); legal texts are drafts; price/billing interval still OPEN; XLSX macros ignored but not reported to the user; import batches are kept indefinitely (retention schedule from CATALOG_WORKFLOWS not implemented); dev DB now holds test import rows for `demo-kahve` (incl. a product named "HESAP()").
- **Next:** reviewer pass; T050/T051 vendor configuration (Vercel/Neon/R2/Cloudflare Access); real OIDC credentials; LEG-* sign-offs.

## 2026-10-26 (late) — re-test pass of the day's work — agent-recorded
- **Verified again (Playwright, real flows):** import guards through the BFF (JSON body → 415, header-only CSV → 422 IMPORT_EMPTY, fake XLSX → 415, 2.2 MB → 413, missing CSRF header → 403); template download 200 with `Content-Disposition`; un-mappable headers show "Eşleme tamamlanmadı" with the apply button disabled, manual mapping re-runs the dry run; "Devam et" resumes a VALIDATED batch; "Vazgeç" marks it Vazgeçildi; re-uploading the same CSV with "Fiyatı güncelle" → 0 new / 4 updated; publish → public API and guest menu show the imported categories (discarded rows absent); PDF export still works with the larger menu; import page has no overflow at 320 and renders at 1280; landing: skip link is the first Tab stop and moves focus to `#icerik`, mobile menu and FAQ open with the keyboard.
- **Bugs found and fixed:** (1) landing overflowed 37 px at 320 (two header buttons) → secondary button hidden under 480 px, phone mock box-sized; (2) **login redirect loop** in ops and admin when the session cookie is stale (ops idle 30 min): `/login` redirected to `/` because the cookie existed, `/` redirected back on 401 → now `/login` asks the API (`/v1/control/session` / `/v1/me`) before redirecting; (3) ops audit labels for `import.apply`, `import.discard`, `pdf.request` added.
- **Known small gap:** the ops/admin layout gate always sends `returnTo=/` (the originally requested deep link is not restored after re-login).
- **Local only:** dev operator TOTP re-enrolled; the secret lives in the git-ignored `.local/` folder for local testing and must never be committed or quoted.
- **returnTo fix (same evening):** `src/proxy.ts` in admin and ops forwards the requested path as `x-qx-path`; the `(app)` layouts pass it to the gate (validated by `safeReturnTo`), and the admin layout carries it through `/select?returnTo=`. Verified: ops `/more/audit?x=1` → login → MFA → back on `/more/audit?x=1`; admin `/more/exports` → login → tenant auto-select → `/more/exports`.

## 2026-10-26 — T053/T018 first MVP source baseline hardening (Codex)
- **Scope / authorization:** User requested the next MVP readiness step and the first version on main. Work branch `fix/T053-mvp-readiness`, based on `c93880e`; existing `.DS_Store` changes excluded. Source baseline only; no production deployment, provider configuration or database migration performed.
- **Changes:** CI now provisions disposable PostgreSQL 17 databases and runs actual unit/API/RLS suites sequentially (cluster-wide roles). Removed the stale Playwright install step: browser tests and their dependency were removed in the preceding implementation, so this CI does not claim mobile browser coverage. Normalized `scripts/dev-db.sh` to LF so Bash can execute it; ignored local PostgreSQL/media `.local/`. Replaced stale `.env.example` with current server-only keys and local origins; documented setup and the legacy-to-`qx` schema migration gate in README.
- **PDF fix / evidence:** Extracted the existing job handler into `apps/worker/src/pdf-job.ts`; READY jobs return before any state update. `apps/worker/test/pdf-job.test.ts` verifies repeated delivery leaves READY untouched and a pending job writes its tenant-scoped file and becomes READY. Existing PDF rendering tests preserved; worker total 7 tests.
- **Dependency security:** Vitest 4.1.12 and Zod 4.6.7; scoped transitive overrides for Multer 2.5.0, ExcelJS UUID 11.1.1 and Zod 4.6.7 (React Hooks supports Zod 3 or 4). `pnpm audit --audit-level=low` reports no known vulnerabilities; frozen lockfile install succeeds.
- **History scan:** Gitleaks 8.30.1 archive checksum verified; reviewed all 25 historical generic-api-key findings. They are migration-name arrays (17) and public Vercel deployment IDs in recorded evidence (8), not credentials. `.gitleaksignore` contains only exact commit/file/rule/line fingerprints; full fetched-history scan reports no leaks. No history rewrite or broad path/rule exclusion.
- **Executed locally:** `pnpm db:start`; `bash -n scripts/dev-db.sh`; `pnpm lint` (9/9 tasks); `pnpm typecheck` (11/11 tasks); `pnpm exec turbo run test --concurrency=1` (272 tests: contracts 22, UI 70, database 42, menu 59, admin 19, ops 20, landing 2, API 31, worker 7); `pnpm build` (8/8 tasks, 2 cached); tracked-file lightweight secret scan clean; `git -c core.whitespace=cr-at-eol diff --check` clean. Local Node v26.12.1/pnpm 9.15.4; CI uses pinned Node 24.22.1. GitHub checks are the hosted evidence for PR #2; they must pass on the final head before merge.
- **Release limits:** No task/legal item marked DONE or APPROVED. R2 and externally hosted worker, real provider OIDC, identity-aware superadmin access, preview/production environment verification, backup/restore, complete mobile/browser acceptance and legal review remain open. Existing deployed/legacy databases require reviewed data migration; current tests use disposable databases only. Reverting this hardening commit requires no schema rollback.
- **Next:** Pass hosted PR checks and merge the first development MVP source baseline to main under the user's authorization; staging/production rollout is a separate milestone.
