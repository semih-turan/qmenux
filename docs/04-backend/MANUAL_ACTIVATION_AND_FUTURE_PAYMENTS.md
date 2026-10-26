# Manual Approval and Future Payment Integration
Status: Binding initial commercial policy.

## Initial launch (V1): no online payment gateway
- QMenuX is **approval-gated**. Signup is allowed but does not activate a business account.
- Only accounts/tenants **explicitly approved and granted a valid license by superadmin** may use protected management functions and publish menus.
- No PayTR/iyzico/Stripe checkout, card collection, recurring charges, auto-renewal, payment webhooks or "payment succeeded" state in V1.
- Superadmin can approve/deny applications, grant/extend/suspend/revoke license with effective dates, reason and audit. User sees pending/approved/expired states in mobile PWA.
- If offline/manual commercial payment is recorded, use administrative `manual_payment_record` with source/reference and reconciliation status, not fabricated provider success. License grant remains explicit privileged action.
- Keep one standard subscription edition/price; amount and period are undecided. Avoid UI promises of free trials or instant purchase without a signed decision.
- AI credit sales and automated payments are future capabilities; locked AI UI may be displayed with accurate messaging.

## Later PayTR-like payment gateway
- Add provider-neutral billing adapter and immutable order/payment attempts; verified server-to-server notifications; replay protection, idempotency, reconciliation, refunds, disputes, accounting review.
- Distinguish `signup approval`, `license entitlement`, `billing status` and `payment status`. Future automation must be opt-in policy and cannot silently bypass superadmin approval without a new signed ADR.
- Use feature flags, provider sandbox, security and legal release gates. No raw card details stored in QMenuX.
- Product UI must only show "Online ödeme" after gateway production readiness and legal approval.

## Tests
PAY-001: V1 has no checkout or card capture routes; payment cannot activate tenant.
PAY-002: only superadmin can grant/extend/revoke license; every change audited.
PAY-003: pending/expired/suspended tenant API and menu policies tested.
PAY-004 (future): signed provider callback, duplicate replay and wrong amount rejected.
