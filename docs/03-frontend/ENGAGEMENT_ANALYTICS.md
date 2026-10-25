# Anonymous Analytics, WhatsApp and PWA Notifications
Status: DRAFT — T032/T033/T034.

## Anonymous analytics
Track QR opens, product/category views, table-level opens and hour/day aggregates without device fingerprinting or visitor identity. Define event validity, deduplication, bot filtering, data retention, local timezone and delayed aggregation. Explain to owner that counts are estimates and not unique people. Prefer server-side privacy-minimized aggregation. Reconcile total and monthly counts against prior QR spec.

## WhatsApp contact
Branch owner can enable a WhatsApp contact button and configure an E.164 phone number. Hide completely if disabled or invalid. Use safe outbound URL, optional prefilled text only with owner approval. No message automation in this phase.

## Push notifications
Owner explicitly enables notifications on a supported mobile PWA. Use Web Push subscriptions, VAPID, per-user preferences, retry/backoff, expiry and unsubscribe. Notify license expiry, export completion, AI job completion and operational alerts. Fallback to in-app notification inbox for denied/unsupported push. Avoid sensitive content on lock screen. Validate iOS Home Screen PWA support/limitations and Android device behavior before release.

## Legal review
KVKK and cookie classification for analytics; transparency and consent/permission for push; marketing message rules if promotional content introduced. No blanket compliance claims without counsel sign-off.
