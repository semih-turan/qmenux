# Domain Model and Invariants

> Status: Draft v0.1 | Date: 2026-10-25 | Owner: Product/Engineering | Review before production.

## Entities / aggregates
- Tenant(id, slug, status, business identity, timestamps); slug unique and reserved-name checked.
- User(id, identity), Membership(tenant_id, user_id, role, status); user may belong to multiple tenants.
- Branch(id, tenant_id, name, address, status).
- Menu(id, tenant_id, branch_id, state, revision), Category(id, menu_id, order), Product(id, tenant_id, category_id, name, price_minor, currency, state, revision).
- Ingredient, ProductIngredient(quantity/unit), AllergenCategory, ProductAllergen(source, verification_status), NutritionFact(kcal, serving_size, source, verification_status).
- MediaAsset(owner_tenant_id, object_key, source_kind, metadata), ThemeAssignment(theme_id, version, tokens).
- Subscription(tenant_id, starts_at, expires_at, grace_ends_at, status); LicenseEvent append-only.
- Order, PaymentAttempt, ProviderEvent, Refund; AIWallet, CreditLedgerEntry, AIJob, AIGeneration.

## Invariants
- Product price nonnegative integer minor units in TRY; display formatted according to locale.
- Product belongs to same tenant as category/menu/branch; enforce composite FKs where feasible.
- Public menu only serves approved published revision.
- License dates and transitions computed server-side; no browser-side authority.
- Credits cannot be negative without explicitly modeled reservation/settlement policy.
- AI output always draft until approved by authorized human.
- Provider events are idempotent by provider+event key.

## State machines
Menu: DRAFT -> PUBLISHED -> ARCHIVED (revisions preserve history). Subscription: PENDING -> ACTIVE -> EXPIRING -> GRACE -> EXPIRED; SUSPENDED is administrative overlay; CANCELED effective according to period policy. Payment: CREATED -> PENDING -> SUCCEEDED/FAILED; refund is separate ledger event. AI job: QUEUED -> RUNNING -> COMPLETED/FAILED/CANCELED.

## Domain events
MenuPublished, ProductPriceChanged, SubscriptionActivated, SubscriptionExtended, PaymentSucceeded, CreditsPurchased, AIJobCompleted. Events carry IDs, tenant ID, version, occurrence time and correlation ID, never raw secrets.

## New aggregates and invariants
- `MenuVisibilityPolicy` belongs to tenant/branch and stores mode, center coordinates, radius_km, allowed administrative region codes, policy version and effective timestamp.
- `BranchWifiDisplay` stores optional SSID and secret reference / password (encrypted at rest), enabled flag and guest-display policy. Never expose in public API if disabled.
- `Product` owns zero-or-one `active_media_id`. Generated candidate assets belong to `MediaRevision` and do not automatically become active.
- `QrScanAggregate` groups valid scan counts by tenant, branch, QR code, Europe/Istanbul calendar date. Raw scan events have bounded retention and no mandatory device fingerprint.
- `AiCreditWallet` and append-only ledger are independent of one-edition `Subscription`. Feature availability requires credit balance and applicable feature activation, not a premium plan.
- PDF exports are generated from an immutable published menu snapshot with revision id and generation timestamp.

## v4 aggregates and invariants
- `ProductAvailability`: AVAILABLE | SOLD_OUT | HIDDEN, changed_by/at, optional reason; never soft-delete to represent sold-out.
- `MenuRevision`: immutable snapshot with revision_number, previous_revision_id, published_by, published_at, checksum; `restoreFrom(revision)` emits a new revision.
- `ImportBatch`: tenant, branch, file metadata, column mapping, validation errors, dry-run summary, status; imports cannot bypass allergen/compliance validation.
- `ProductTranslation`: locale, name, description, translation_status; owner verifies AI-translated claims before publish.
- `MenuSchedule`: target menu, timezone, recurrence/window, priority, effective_at, status; no ambiguous overlaps.
- `TableQr`: branch, table label, random token hash, active/revoked, generation date; public token cannot select tenant authorization context.
- `NotificationPreference`/`PushSubscription`: user and device-scoped; revocable; private notification content omitted from push body.
- `WhatsAppContact`: branch-scoped enabled flag and validated E.164 number.
- Analytics aggregates contain counts, not visitor identity.

## Integration principals
`IntegrationClient` (tenant_id, optional branch_id, owner_user_id, status, expiry), `IntegrationCredential` (hashed key id/secret reference, scopes, last_used_at, revoked_at), `WebhookEndpoint` (tenant_id, URL, secret ref, subscribed events), `WebhookDelivery` (event id, attempt, status), `ChannelConnection` (provider, external account identifier, tenant_id, scopes, status). Superadmin service principals are platform-scoped and cannot be tenant-created.


## v6 identity and approval entities
- `User` (stable internal id), `ExternalIdentity` (provider+issuer+subject), `TenantApplication` (draft/pending/approved/rejected), `ApprovalDecision` (actor, timestamp, reason), `TenantLicenseGrant` (validity, audit).
- External identity link never implies tenant membership; invitation and approved tenant membership are separate.
- Registration, approval, licensing, payment and AI credits are separate state machines.

## v7 business type and design boundaries
- `BusinessProfile.business_type` is a configurable classification/hint, not an authorization or catalog schema discriminator.
- `StarterCatalogTemplate` and `BusinessTypeThemeRecommendation` are versioned, reusable templates. A tenant's selected `public_theme_id` is independent of `business_type`.
- Admin UI design tokens are platform-level and never tenant-controlled.
