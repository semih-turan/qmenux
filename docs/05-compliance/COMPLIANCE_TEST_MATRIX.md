# Compliance Test Matrix

> Working compliance specification · 2026-10-25 · Requires qualified legal/accounting review before production.

| Test ID | Requirement | Automated test / evidence |
|---|---|---|
| CT-001 | LEG-001 | PDF/print export works on phone; onboarding acknowledges physical menu obligation |
| CT-002 | LEG-002 | No published product without valid TRY price; price audit revision retained |
| CT-003 | LEG-003 | Prohibited mandatory surcharge controls absent; server rejects deprecated fee fields |
| CT-004 | LEG-004 | Business classification + effective date selects approved ingredient/kcal rule; boundary-date tests |
| CT-005 | LEG-005 | Unverified AI allergen suggestions cannot publish as verified; explicit human approval and provenance |
| CT-006 | LEG-006 | Tenant-scoped export/deletion request workflow; access logging and retention tests |
| CT-007 | LEG-007 | Optional tracking off before consent, rejection works, withdrawal respected |
| CT-008 | LEG-008 | Merchant agreement version and acceptance evidence persisted; no forced consent to unrelated marketing |
| CT-009 | LEG-010 | Duplicate webhook never double-extends license or credits; invalid signatures rejected |
| CT-010 | LEG-011 | Invoice issue tracked and manual/accountant review path exists before automated invoicing |
| CT-011 | LEG-012 | AI outputs remain draft, generated asset provenance and review captured |

Every CT item needs test owner, test environment, actual evidence link, review date and result (`PASS/FAIL/BLOCKED`). A source being verified does not make a test pass.

## Added compliance checks
- CT-012: guest location prompt and privacy notice reviewed; coordinates not persisted by default.
- CT-013: optional Wi-Fi password disclosure is explicit; disabled settings never leak public credentials.
- CT-014: AI-produced allergens/calories cannot bypass owner verification and legal publication validation.
- CT-015: A4 menu and separate allergen PDF contain approved mandatory data and preserve publication snapshot.
- CT-016: scan counter does not silently introduce fingerprinting or nonessential cookies.

## v4 checks
- CT-017: historical menu revisions and price changes auditable without modifying history.
- CT-018: imported allergen/ingredient claims require validation before publication.
- CT-019: all locales display required approved food disclosures.
- CT-020: analytics collects only approved aggregate/minimized information.
- CT-021: WhatsApp and push disclosures/opt-outs match reviewed policies.
- CT-022: scheduled price publication updates guest menu and printable exports coherently.
