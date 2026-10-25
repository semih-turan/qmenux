# Catalog Operations, Imports, Versions and Scheduling
Status: DRAFT — implementation contract for T025/T026/T027/T031.

## Availability
State machine: AVAILABLE ↔ SOLD_OUT ↔ HIDDEN, separate from deletion and publish status. SOLD_OUT displays badge; HIDDEN omitted from public results. Audit every change. Confirm PDF inclusion policy in T000.

## Publication and restore
Editors modify drafts; publish validates prices, ingredients, allergens and localization. Publication creates immutable snapshot and atomically switches current pointer. Restore previews historic snapshot and publishes **new** revision with `restored_from_id`. Reject concurrent conflicting publish via revision/version check. Trigger CDN invalidation and audit event.

## CSV/XLSX import
Download example template; accept CSV/XLSX only with size/row limits and MIME/content validation. Staged upload → parse → column mapping → dry-run preview → duplicate resolution → draft commit → manual publication. Capture per-row errors and rollback/compensation semantics. Imported prices in integer minor units; support Turkish decimal separators and encoding. Never execute spreadsheet formulas/macros; sanitize exported CSV against formula injection. Delete staged files on retention schedule.

## Schedules
Schedule menu windows and future price updates by branch timezone. Detect overlaps, define deterministic priority and effective date, use idempotency keys, record applied revisions, and invalidate cached public menu on transition. Owner can pause/cancel. Never silently change already-printed PDFs; show print refresh warning after changes.

## Definition of done
Domain/API/RLS, phone UI, audit, failure recovery, accessibility, cache and regression tests AV-001/REV-001/IMP-001/SCH-001.
