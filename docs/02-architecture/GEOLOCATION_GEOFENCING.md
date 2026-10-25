# Geolocation / Geofencing Design
Status: Draft; product and legal review required.

## Purpose
Owner controls whether guest menu is accessible everywhere or within geographic limits, from mobile admin Settings.

## Modes
1. OFF: no geolocation requested, menu public.
2. RADIUS: business branch center plus radius in **kilometers**; UI must label radius and show diameter = 2 × radius.
3. ADMIN_REGIONS: allowed Turkish province and/or district codes from versioned authoritative administrative data.
4. COMBINED: radius AND selected regions by default; alternative OR requires explicit product decision.

## Policy / UX
- Owner can configure enable, radius, center, provinces/districts, preview, save, test, and disable with thumb-friendly controls.
- Never collect guest location when OFF.
- When ON, browser permission is requested only after clear explanation and user action; handle denial, unavailable GPS and low accuracy with explicit states.
- A restriction is best-effort visibility, **not security**; GPS can be spoofed. IP-based location is not a reliable substitute for province/district enforcement.
- Prefer transient coordinate checks, do not persist guest precise location. Do not include coordinates in analytics.
- Guest outside area sees a polite unavailable message with no sensitive data; owner and authorized previews bypass guest restriction securely.
- Branch centers should be explicit, geocoded/verified and editable by authorized owner.
- For radius use geodesic/Haversine or PostGIS geography distance; never compare latitude/longitude by naive planar degrees.
- Administrative boundaries should use versioned official region codes and reliable geometry data; a user's claimed city is not sufficient.

## Unresolved decisions
- Exact behavior when guest declines location: deny with explanation vs allow fallback; legal/product approval required.
- How to handle uncertain GPS accuracy near boundary.
- Whether owner can configure radius and region simultaneously, and AND vs OR semantics.
- Definition of “1 km çapında”: UI uses radius and gives diameter equivalent.
