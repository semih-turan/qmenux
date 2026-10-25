# AI Studio Future Architecture

> Status: Draft v0.1 | Date: 2026-10-25 | Owner: Product/Engineering | Review before production.

## Status
Future phase; V1 data model must allow media provenance, ingredient quantities, nutrition provenance and approval states. Do not build provider-specific AI dependencies into Catalog domain.

## Ports
ImageGeneration, ImageEditing, DescriptionDrafting, Translation, NutritionEstimation and AllergenSuggestion. Provider adapters behind AI Orchestrator; capability-based routing and budgets.

## Workflow
Owner requests job -> validate tenant/license/credits -> reserve credits -> enqueue -> provider execution with retries/timeouts -> store generated asset/text with provenance -> owner reviews -> approve/reject -> publish via Catalog application service -> settle/refund reserved credits. A closed phone must not stop the server job.

## Credits
Append-only ledger for purchases, reservations, settlements, refunds and adjustments. Atomic balance enforcement, idempotency by job/order, provider-cost metrics, daily spend ceilings and per-tenant quotas. Never rely on client balance.

## Safety and accuracy
Generated images should be disclosed as illustrative when appropriate and not misleading about served product. Preserve original photo and derivatives, track prompt/provider/version, handle IP/consent policy. Product-name-only calorie estimates are insufficient: require recipe ingredients, quantities, yield, serving size and cooking losses; output estimated range and source. Allergen suggestions must be explicitly unverified, consider sauces/processing/cross-contact, and require authorized human confirmation.

## Data/privacy
Avoid sending personal/customer data to models unnecessarily; evaluate provider retention, regional processing, contract and KVKK transfer obligations. Strip EXIF from public images unless needed. Do not send secrets or raw payment data to AI.

## Locked AI UX and credit semantics
- AI features are optional **credit-funded** actions, not subscription tiers. If not available, show disabled controls with explanation and path to acquire credits.
- Before running, server returns a versioned quote with action name, credit cost, expiry and wallet balance; UI shows the exact debit and asks confirmation.
- Reserve credits atomically; settle on successful result, refund/release on failure according to published rules; prevent double charge on retries.
- Supported planned actions: generate product image, edit/background replace existing image, fit to theme format, draft title, draft description, draft ingredients, estimate kcal, suggest possible allergens.
- Ingredients, calories and allergens are drafts; product owner must verify against recipe, portions, suppliers and cross-contact information. Never infer allergen absence from product title or photograph.
- One active image per product; AI outputs remain candidate revisions until owner chooses one.

## Integration API boundaries
External programs cannot directly spend AI credits or publish generated nutrition/allergen content without explicit tenant scope, server-verified cost quote and human review. Channel adapters use the same wallet and approval use cases as the admin PWA; no alternate billing path.
