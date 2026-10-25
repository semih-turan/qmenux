# Mobile-Primary Admin Flow Contracts
Status: Draft.

## Owner app navigation
Bottom tabs: Home, Menu, QR, Reports, More. Settings under More: Geofence, Wi-Fi, Themes, License, AI Credits.
All flows operable with one hand and no desktop-only affordances.

## Essential journeys
1. Change price: Home/Menu → search product → price sheet → validate/save → visible success.
2. Geofence: More/Settings → Visibility → toggle → radius and/or regions → preview → save → guest test.
3. Wi-Fi: Settings → Guest Wi-Fi → SSID and optional password → enable → preview → save; hide when off.
4. Theme: Settings → Themes → browse ten → preview → apply → revert.
5. PDF: Menu → Export → Full A4 / Allergen A4 → generate → download/share.
6. QR analytics: Home/Reports → total + this month with timezone and definition.
7. AI: Product → AI tools (locked without credits) → action and cost quote → confirm → background progress → review → approve/publish.
8. License: Home/Account → days remaining, expiry, renewal action.
9. Superadmin: search tenant, inspect status, change license, manage themes, review alerts, all on phone.

## UX quality gates
320px min viewport, dynamic text scaling, no clipped bottom action, >=44px targets, input keyboard not covering save, offline draft recovery, confirmation for destructive actions, screen reader labels and contrast checks.

## v4 journeys
9. Menu → product → mark SOLD_OUT or HIDDEN → publish/verify customer state → restore.
10. Menu → History → choose snapshot → compare → restore as new revision.
11. Menu → Import → XLSX/CSV → mapping → dry run → resolve row errors → import drafts → publish.
12. QR → Tables → generate/rename/revoke → download printable batch.
13. Menu → Languages → choose locales → edit missing translations → preview fallback.
14. Menu → Schedule → create time window or future price → conflict check → confirm.
15. Reports → anonymous product/category/table/time summaries; no personal visitor drill-down.
16. Settings → WhatsApp → validate E.164 → preview → enable/disable.
17. More → Notifications → opt-in push / fallback inbox → preferences → unsubscribe.
All flows require iPhone Safari installed PWA and Android Chrome PWA manual QA; verify background/relaunch behavior.

## v7 owner onboarding addition
After approval and license, owner chooses business type (café, specialty coffee, bakery, brunch, restaurant, pizzeria, fast-food, other), reviews starter categories and suggested public theme, edits data and explicitly publishes. This flow must fit 320px and allow skipping suggestions.
