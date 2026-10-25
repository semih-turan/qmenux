# Release Legal Checklist

> Working compliance specification · 2026-10-25 · Requires qualified legal/accounting review before production.

## Production legal gate (must be explicitly signed)
- [ ] Operating legal entity, customer segment (B2B/B2C) and contracting geography confirmed.
- [ ] LEG-001 through LEG-012 applicability reviewed by appropriate counsel/accountant/food specialist.
- [ ] All blocking requirements have approved rule versions, linked implementation and passing tests.
- [ ] Merchant terms, privacy/cookie notices and DPA as applicable are approved and accessible in mobile UI.
- [ ] Physical menu and signage duties explained to merchant; printable output tested.
- [ ] Ingredient/allergen/kcal responsibility and AI draft validation are explicit.
- [ ] Data flow, storage regions, subprocessor list, retention, deletion/export and incident plan approved.
- [ ] Payment flow, refund and invoicing reviewed if payments are enabled.
- [ ] Accessibility, consent, tenant isolation and backup restore evidence attached.
- [ ] Product owner, legal reviewer, security reviewer and date recorded.

**Stop-ship:** missing legal approval for applicable material obligations, tenant isolation failure, misleading allergen/energy publication, unverified payment callbacks or missing privacy controls.

## New release blockers
- [ ] Geolocation notice, legal basis and retention/minimization reviewed.
- [ ] Wi-Fi display/security wording and publication consent approved.
- [ ] PDF output legally checked against current applicable restaurant/menu rules.
- [ ] AI suggestions are explicitly unverified until approved; images checked for misleading depiction.
- [ ] QR analytics privacy and bot-counting policy reviewed.

## v4 legal release review
- [ ] Imported food claims and translations have accountable human approval.
- [ ] Price change history and schedule/printed-price consistency checked.
- [ ] Analytics event collection and retention approved for KVKK/cookie compliance.
- [ ] WhatsApp outbound-link wording and optional push notices/permissions reviewed.
- [ ] Push content classified as transactional vs promotional and applicable rules checked.

## API/channel go-live checks
- [ ] External API terms and credential lifecycle approved.
- [ ] Telegram/WhatsApp provider terms, message purpose, opt-in and KVKK applicability reviewed before integration enablement.
- [ ] Cloudflare/IdP subprocessor and transfer assessments reviewed as applicable.


## v6 launch review
- [ ] Privacy disclosures and provider contracts for Google/Microsoft/Apple verified and dated.
- [ ] Signup terms, onboarding approval policy and rejection handling approved.
- [ ] V1 UI makes no untrue claim of instant activation, online payment or active AI credit purchase.
- [ ] Landing privacy/cookie/marketing claims approved before **later** landing launch.
- [ ] Future PayTR-style integration not enabled without separate legal/accounting/security release gate.
