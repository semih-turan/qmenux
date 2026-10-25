# Database Design

> Status: Draft v0.1 | Date: 2026-10-25 | Owner: Product/Engineering | Review before production.

## PostgreSQL conventions
UUID primary keys, UTC timestamptz, snake_case, `created_at`/`updated_at`, `tenant_id` on tenant-owned rows. Money stored as integer minor units + currency, never float. Migrations versioned and reviewed.

## Core tables
`tenants`, `users`, `memberships`, `branches`, `menus`, `categories`, `products`, `ingredients`, `product_ingredients`, `allergen_categories`, `product_allergens`, `nutrition_facts`, `media_assets`, `themes`, `theme_assignments`, `qr_codes`, `subscriptions`, `license_events`, `orders`, `payment_attempts`, `provider_events`, `refunds`, `ai_wallets`, `ai_credit_ledger`, `ai_jobs`, `ai_generations`, `audit_logs`, `outbox_events`, `compliance_rules`, `compliance_reviews`.

## Keys and indexes
- `tenants.slug` unique; reserved names forbidden (admin, api, control, www, etc.).
- Tenant-scoped uniqueness: `(tenant_id, branch_id, slug)` where applicable.
- Foreign keys preserve tenant association, preferably `(tenant_id, id)` composites.
- `(tenant_id, status, updated_at)` on products; `(tenant_id, expires_at)` on subscriptions.
- Unique `(provider, external_event_id)` on provider events and unique `(order_id, fulfillment_type)` on license/credit fulfillment.
- Audit and ledger entries append-only; financial retention policy determined with accountant/legal review.

## Transaction safety
Use request-scoped transaction with `SET LOCAL app.tenant_id = ...` and RLS policies; ensure role does not BYPASSRLS and table owner behavior is accounted for (`FORCE ROW LEVEL SECURITY` as needed). Pooling mode must preserve transaction context. Missing tenant context must deny by default. Privileged platform operations use separately authorized paths and roles.

## Migration policy
Expand -> backfill -> switch -> contract. Never deploy destructive schema changes without tested backup/rollback. Seed regulatory categories only from reviewed official references. Add data retention/deletion and export jobs.

## Schema additions / constraints
- `menu_visibility_policies(tenant_id, branch_id, mode, center_lat, center_lng, radius_meters, allowed_province_codes, allowed_district_codes, combination_mode, updated_at, updated_by)`; prefer normalized `visibility_allowed_regions` when lists become complex. Validate district/province code relationships.
- `branch_wifi_settings(tenant_id, branch_id, enabled, ssid, password_ciphertext, reveal_mode, updated_at)`; encrypt secrets, exclude from audit log payloads.
- `products.active_media_id` nullable FK; one active image reference per product. Candidate AI assets in `media_assets`/`media_revisions`, not an array of product images.
- `qr_scan_events` (bounded/optional) and `qr_scan_daily(tenant_id, branch_id, qr_code_id, local_date, valid_count)` with unique compound key; aggregate in Europe/Istanbul and deduplicate per defined scan event id.
- `pdf_export_jobs(tenant_id, branch_id, menu_revision, export_type, status, file_key, generated_at, expires_at)`; types MENU_A4 and ALLERGEN_A4.
- `ai_action_catalog(action_code, credit_cost, enabled, effective_at)` plus append-only wallet transactions and reservation/settlement semantics. Publish immutable cost quote before spending.
- Add tenant-scoped FK/indexes and RLS policies to all new tenant-owned tables.

## v4 proposed schema / indexes
- `products.availability_status` enum + `availability_changed_at/by`; tenant/branch-scoped indexes; enforce one active product image as before.
- `menu_revisions(id,tenant_id,branch_id,menu_id,revision_no,snapshot_json,checksum,published_by,published_at,restored_from_id)` immutable; unique `(tenant_id,menu_id,revision_no)`; `menus.published_revision_id` FK.
- `import_batches(id,tenant_id,branch_id,object_key,mapping_json,status,summary_json,created_by,created_at)` and `import_row_errors(batch_id,row_no,field,code)`; short file retention.
- `product_translations(tenant_id,product_id,locale,title,description,review_status)` unique per product/locale; index localized search via approved PostgreSQL search approach.
- `menu_schedules(tenant_id,branch_id,menu_id,timezone,start_at,end_at,recurrence_rule,priority,status)` and `scheduled_price_changes(tenant_id,product_id,price_minor,currency,effective_at,status,idempotency_key)`; constraints to prevent conflicting active schedules.
- `qr_tables(id,tenant_id,branch_id,label,token_hash,active,revoked_at)` and `qr_scan_daily` dimension `table_id` nullable; ensure uniqueness and no raw visitor identifiers.
- `analytics_daily(tenant_id,branch_id,date,entity_type,entity_id,metric,count)` and `analytics_hourly` with retention policy; define bot and dedup methodology.
- `branch_whatsapp(tenant_id,branch_id,enabled,phone_e164)`; `push_subscriptions(user_id,tenant_id,endpoint_ciphertext,keys_ciphertext,revoked_at)`; `notification_preferences`, `notification_deliveries` with TTL and retry policy.
- Tenant FK/RLS for all tenant-owned tables, unique keys and migration/rollback tests. Do not store plaintext uploaded files indefinitely.

## API integration persistence
Create tenant-isolated `integration_clients`, `integration_credentials`, `channel_connections`, `webhook_endpoints`, `webhook_deliveries` and append-only `integration_audit_events`; unique tenant-scoped keys, foreign keys and RLS on tenant-owned tables. Store hashed opaque API keys and secret-manager references, never plaintext tokens. Keep webhook delivery idempotency keys and retention policy. Do not expose internal platform credentials in tenant queries.


## v6 schema migration candidates
- `auth_identities(user_id, provider, issuer, provider_subject, email_at_link, linked_at)` unique `(provider,issuer,provider_subject)`; no unique requirement on external email.
- `tenant_applications(id, applicant_user_id, requested_name, status, submitted_at, reviewed_at, reviewed_by, decision_reason)`.
- `tenant_license_grants(id, tenant_id, granted_by, starts_at, expires_at, reason, revoked_at)` plus append-only audit.
- Store OIDC state/nonce/PKCE verifier short-lived and single-use; never log provider tokens. Encrypt any durable credentials.
- RLS/privileged operator boundaries for approval and grants; migration tests for account-linking races and duplicate applications.

## v7 business type and starter template schema
- Add `business_profiles.business_type_code` (nullable, extensible enum/reference table).
- `starter_catalog_templates(id, business_type_code, locale, version, categories_json, enabled)` and `business_type_theme_recommendations(business_type_code, public_theme_id, rank)`.
- Validate ten stable `public_theme_id` values in theme registry; tenant choice must reference registry. Applying templates must be tenant-scoped, idempotent and audited.
- Never seed sample price/allergen facts as verified production data.


## v8 Neon PostgreSQL — binding
- Production DB: **Neon PostgreSQL**. Maintain RLS, tenant-scoped foreign keys, compound indexes, migration history and audit.
- Use Neon pooled runtime connection where driver supports required transaction semantics; separate direct migration URL. Never expose either to browser.
- In transaction-pooling mode, use transaction-local RLS context within one explicit transaction and test against pool reuse; avoid persistent session assumptions.
- Test serverless concurrency, connection exhaustion, query timeouts, fail-closed tenant context, migrations on isolated Neon branches and production restore procedures.
- Neon region, retention/PITR features and backup policy must be validated against selected plan and KVKK requirements.
- Drizzle vs Prisma remains open until T047 proof-of-concept. See `VERCEL_NEON_INFRASTRUCTURE.md`.


## Operator passkeys —0014 local prerequisite

Additive0014 extends only qmenux_operator with private enrollment grants/public credentials, one-use challenge hashes, short browser-bound proof hashes and append-only security events. Fixed EXECUTE-only contracts retain explicit identity/application predicates, row locks/counter concurrency and revocation; runtime gets no table access. No operator/grant/key or tenant entitlement is seeded. Populated/hidden-data/later-version rollback is refused; retain history and use forward corrections.0001–0013 and manual Neon probe guards remain unchanged. [Detailed authority/privacy/rollback/test contract](../04-backend/OPERATOR_PASSKEY_CONTRACT.md).
