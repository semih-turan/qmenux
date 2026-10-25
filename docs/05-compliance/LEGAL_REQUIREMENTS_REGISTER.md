# Legal Requirements Register

> Working compliance specification · 2026-10-25 · Requires qualified legal/accounting review before production.

## Status vocabulary
`VERIFIED_SOURCE` means an official publication has been located, **not** that legal applicability has been approved. `LEGAL_REVIEW_REQUIRED` and `APPROVED` are distinct. Every rule has `rule_id`, `source_url`, `source_date`, `effective_from`, `scope`, `merchant_classification`, `owner`, `reviewed_at`, `implementation`, `test_id`, `approval_status`.

| ID | Topic | Requirement / product consequence | Status |
|---|---|---|---|
| LEG-001 | QR vs printed menu | QR permitted, but physical menu on customer request; export print-ready menu and merchant onboarding notice | VERIFIED_SOURCE; legal review required |
| LEG-002 | Price visibility | Legible accurate prices; no hidden fees; validate published prices and preserve price revisions | VERIFIED_SOURCE; legal review required |
| LEG-003 | Service/cover/table fees | Prevent merchant-configured mandatory service/kuver/masa surcharge fields in menu | VERIFIED_SOURCE; legal review required |
| LEG-004 | Food contents / energy | Ingredient and energy disclosures with business classification and applicable transitional dates | VERIFIED_SOURCE; legal review required |
| LEG-005 | Allergens | Collect 14-category allergen information, source and merchant verification; avoid auto-certified AI claims | LEGAL_REVIEW_REQUIRED |
| LEG-006 | Privacy | Map controller/processor roles, notices, data subject rights, retention, cross-border transfers | LEGAL_REVIEW_REQUIRED |
| LEG-007 | Cookies | Necessary vs optional categories; consent before optional cookies when required; withdrawal | VERIFIED_SOURCE; legal review required |
| LEG-008 | SaaS contract | B2B master terms, service description, renewal, cancellation, SLA, support, termination, export | LEGAL_REVIEW_REQUIRED |
| LEG-009 | Consumer e-commerce | Determine B2B vs B2C and applicability of distance-selling, subscription and ETBİS rules; do not assume | LEGAL_REVIEW_REQUIRED |
| LEG-010 | Payments | PSP merchant contract, verified callbacks, refunds, chargebacks, PCI scope, invoices | LEGAL_REVIEW_REQUIRED |
| LEG-011 | E-documents | Accountant to determine e-Arşiv/e-Fatura obligations and current exceptions | VERIFIED_SOURCE; accounting review required |
| LEG-012 | AI images/content | Licensing, rights to uploaded images, synthetic depiction disclosures, human review and provider data-processing terms | LEGAL_REVIEW_REQUIRED |

## Official evidence
- LEG-001/002: https://tuketici.ticaret.gov.tr/yayinlar/tuketici-bilgi-rehberi/fiyat-etiketleri-hakkinda-bilgilendirme
- LEG-003: https://ticaret.gov.tr/haberler/ticaret-bakanligi-tarafindan-fiyat-etiketi-yonetmeliginde-degisiklik-yapildi
- LEG-004: https://istanbul.tarimorman.gov.tr/Duyuru/465/Tgk-Etiketleme-Ve-Tuketicileri-Bilgilendirme-Yonetmeligi-Ve-Tgk-Etiketleme-Ve-Tuketicileri-Bilgilendirme-Yonetmeligi-Kilavuzunda-Yapilan-Degisikliklere-Iliskin-Aciklamalar
- LEG-007: https://www.kvkk.gov.tr/Icerik/7353/Cerez-Uygulamalari-Hakkinda-Rehber
- LEG-009: https://tuketici.ticaret.gov.tr/yayinlar/tuketici-bilgi-rehberi/mesafeli-sozlesmeler-hakkinda-bilgilendirme
- LEG-011: https://cdn.gib.gov.tr/api/gibportal-file/file/getFileResources?objectKey=arsiv%2Fyardim-kaynaklar%2Finfografikler%2Fpdfs%2F2025_e_arsiv_fatura.pdf

## Implementation rules
No automated legal validation without approved source and applicability mapping. Any ambiguous applicability is a visible compliance-review task, not an inferred prohibition. Never claim software itself guarantees a merchant's legal compliance.

## Additional legal/privacy review items (not legal conclusions)
- LEG-GEO: Determine KVKK lawful basis, purpose, notice and minimization for browser geolocation. Precise visitor coordinates should be evaluated ephemerally and not retained by default; consent/permission are distinct concepts.
- LEG-WIFI: Confirm guest network/password publication is a deliberate business choice; document security guidance and avoid conflating Wi-Fi display with obligations relating to provision of internet access or traffic logs.
- LEG-AI: AI-generated images must not mislead customers about actual food; calories and allergens require documented human verification and legally applicable food information checks.
- LEG-PDF: Printable menu and allergen PDF must be checked against applicable current pricing, food information and physical-menu requirements; generated PDF does not itself establish compliance.
- LEG-ANALYTICS: Define privacy-friendly QR analytics, cookie/tracker use, retention and bot handling.
- Legal owner must verify official source, applicability, effective date and sign-off for each before claiming compliance.

## v4 review queue — not legal advice
- LEG-MENU-VERSIONS: assess auditability of published price/ingredient changes and retention.
- LEG-IMPORT: verify contractual responsibility for imported product claims and retention/deletion of uploaded spreadsheets.
- LEG-I18N: ensure translated mandatory food disclosures remain accurate and legally sufficient; translation requires owner review.
- LEG-ANALYTICS: assess KVKK/cookie implications of additional view events, dedup, retention and data minimization.
- LEG-WHATSAPP: third-party redirect notice, data sharing and marketing-message boundaries.
- LEG-PUSH: user permission, transparency, opt-out and any electronic commercial message obligations depending on content.
- LEG-SCHEDULE: scheduled price changes must comply with applicable displayed-price rules; ensure physical/PDF copies can be refreshed.
Record official source, effective date, applicability and counsel review before legal sign-off.

## Integration legal review scope
- LEG-API: B2B API terms, acceptable use, integration credential handling, audit/retention, subcontractors and service limits.
- LEG-CHANNEL: Telegram/WhatsApp Business terms, Meta/Telegram platform policies, KVKK roles and transfer analysis, consent and commercial messaging requirements where applicable.
- LEG-AUTH: MFA/Access identity-provider processing and relevant cross-border transfers/data processing agreements.
These are review items, not assertions of completed legal compliance; record source, effective date, reviewer and sign-off.


## v6 legal review: federated identity and manual commercial activation
- LEG-AUTH: assess provider identity terms, privacy notice for Google/Microsoft/Apple sign-in, data retention, cross-border transfer and subprocessors under applicable KVKK obligations.
- LEG-ONBOARD: distinguish application submission, approval, service contract acceptance, billing/invoicing and license start; log versioned acceptance when legally appropriate.
- LEG-MARKETING: landing cookie consent, contact form privacy, accurate price/feature claims and account cancellation/deletion process.
- LEG-PAY: V1 manual approvals/no gateway; PayTR-like future gateway requires separate merchant/accounting/contract/security review before launch.
