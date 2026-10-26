# Subscription, License and Payments

> Status: Draft v0.1 | Date: 2026-10-25 | Owner: Product/Engineering | Review before production.

## Commercial rules
Exactly ONE SaaS edition and ONE standard subscription price (actual amount and interval TBD). No feature tiers. All base functionality included. AI credits can be purchased separately in future. Tenant license scope (per business vs branch) to be approved; recommendation tenant-level.

## License model
Subscription stores `starts_at`, `expires_at`, `grace_ends_at`, status, renewal mode and policy version. UI shows server-calculated days left and expiry; notify at 30/15/7/1 days subject to notification settings. Admin grants/extensions require reason, actor and audit.

## Billing separation
Billing owns orders/payment attempts/refunds; Subscription owns entitlement and expiry; AI Wallet owns credits. Payment success emits durable event and downstream consumer fulfills once. Manual license grants do not require a payment.

## Provider-neutral port
`createCheckout`, `verifyWebhook`, `getPayment`, `refund` (where supported), capabilities metadata; implementations may include PayTR, iyzico, eligible Stripe accounts or bank virtual POS. Provider selection must respect merchant country, legal eligibility and contract capabilities. Automatic recurring charges are a separate capability, not assumed universal.

## Flow
Create immutable priced order -> initiate provider checkout -> receive server callback -> verify authenticity, amount, currency and reference -> persist payment + outbox atomically -> idempotent subscription extension OR AI credit ledger -> notify tenant. Browser redirect is informative only.

## Expiry policy
Define grace period and customer-facing menu behavior before launch. Recommend preserving read-only public menu during brief grace while limiting admin writes; clearly communicate status. Avoid abrupt guest disruption. Never change published prices without owner action.

## Refunds/disputes
Explicit rules for reversal, partial refund, already-consumed AI credits and chargebacks. Maintain append-only financial ledger; do not delete payment history. Reconcile daily with provider reports.


## v6 binding V1 override: manual activation only
Earlier gateway design describes **future** capability, not launch behavior. **No online payment integration at initial launch.**
- Signup is registration only; superadmin approval + explicit time-bounded license grant required before tenant can operate/publish.
- License is independent from payment; privileged manual grant/extension/revocation is the V1 source of entitlement.
- No self-service checkout, card storage, automatic renewal or provider callbacks in V1.
- PayTR/iyzico/other gateway is optional future work; implement only after legal review, sandbox verification and signed release decision.
- One SaaS edition/price; billing term and amount remain T000 open decisions.
See `MANUAL_ACTIVATION_AND_FUTURE_PAYMENTS.md`.
