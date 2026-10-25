# Türkiye Regulatory Compliance Register

> Status: Draft v0.1 | Date: 2026-10-25 | Owner: Product/Engineering | Review before production.

## IMPORTANT: legal verification required
This is a requirements register, **not legal advice or a guarantee of full compliance**. Before release, legal counsel and relevant food-regulation specialist must verify official consolidated texts, effective dates, business classifications and exceptions. Do not hardcode deadlines from informal summaries.

## Source-of-truth workflow
For every rule store: `rule_id`, authority, official regulation/title, official URL, article, published_at, effective_from/to, business scope, obligation, UI evidence, validation behavior, reviewer, reviewed_at and version. Mark unverified rules as `PENDING_REVIEW`, never silently treat as binding.

## Topics to review
1. Ministry of Trade price-label and tariff/price-list requirements for restaurants/cafes: placement, visibility, physical menu on request, taxes and additional charges.
2. Ministry of Agriculture and Forestry food information: 14 allergen categories, ingredient/energy disclosures, serving basis, chain/independent classification and transition periods.
3. Turkish Consumer Protection Law and distance-sales requirements if subscriptions sold online; pre-contract disclosures, withdrawal exceptions and electronic commerce obligations as applicable.
4. KVKK: privacy notices, processor/controller roles, cookies and analytics consent, retention, international transfers and data subject requests.
5. Payment compliance: licensed payment providers, invoicing/e-archive obligations and records retention; consult accountant.
6. Accessibility and digital consumer disclosures as applicable.

## Product behavior
Product form captures ingredient list, allergen flags with evidence/verification status, kcal and serving size with provenance, price in TRY, optional legal notices. Compliance engine evaluates only reviewed active rules by business classification/date; drafts show actionable warnings; blocking rules require documented authority and approval. Export printable price/menu formats.

## AI safeguards
AI can suggest but cannot certify ingredient, calorie or allergen information. Require recipe quantities and verified source where possible; show uncertainty, cross-contact limitations and human approval with timestamp.

## Release checklist
Official sources checked on release date; legal sign-off recorded; physical signage responsibilities disclosed to merchant; notice/cookie texts reviewed; data processing contracts and tax obligations reviewed; versioned rule regression tests pass.

## Official source entry points (verify exact current articles)
- https://www.resmigazete.gov.tr/
- https://ticaret.gov.tr/
- https://www.tarimorman.gov.tr/
- https://www.kvkk.gov.tr/
- https://www.mevzuat.gov.tr/

## Additional operational documentation
Read `LEGAL_REQUIREMENTS_REGISTER.md`, `LEGAL_OPERATIONS.md`, `LEGAL_DOCUMENT_TEMPLATES.md`, `COMPLIANCE_TEST_MATRIX.md` and `RELEASE_LEGAL_CHECKLIST.md`. Implement verified, approved rules only; legal sign-off remains an explicit launch gate.
