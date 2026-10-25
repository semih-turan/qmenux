# QMenuX Landing Page Specification
Status: Approved direction; implementation **last**. Date: 2026-10-25.

## Purpose, domains and order
- Public marketing website at `https://qmenux.com` (optionally canonical `www` redirect).
- Public pages include **Log in** and **Sign up** entry points, but landing visual/SEO/marketing build is **last** after public QR menu and mobile-first tenant/superadmin PWA are implemented and tested.
- Identity/auth backend and minimal functional sign-in/onboarding screens are **early foundational work**; marketing landing being last must not block tenant testing or owner access.
- Login entry routes: `/login` and `/signup` on apex may redirect to centralized auth pages or `admin.qmenux.com/login` and `/signup`. Canonical route and redirect policy require ADR; never implement two independent identity stores.
- First-party accounts may be created via email/password (if enabled) and federated sign-in: Google, Microsoft identity platform (personal Outlook.com plus supported work/school accounts), and Sign in with Apple, subject to provider configuration and eligibility. Use OIDC where supported; OAuth 2.0 authorization alone is not proof of identity.
- Primary CTA: "Ücretsiz hesap oluştur" only if genuinely free; otherwise "Hesap oluştur"/"Demo talep et". Do not promise instant access: new accounts are **PENDING_APPROVAL** until superadmin authorizes their tenant/license.
- Secondary CTA: "Giriş yap". Clear sign-up approval status and contact/help link.

## Information architecture
1. `/` hero, value proposition, menu preview, benefits (mobile admin, ten themes, PDF, analytics), CTA.
2. `/ozellikler` concise features and accurate roadmap labels; future AI/payments never advertised as already available.
3. `/nasil-calisir` create account → approval → configure business → publish QR.
4. `/temalar` ten public theme previews, with demo data and no false legal claims.
5. `/fiyatlandirma` single edition, one price when approved, AI credits only if live; manual activation terms explained.
6. `/giris` or `/login` and `/kayit` or `/signup` canonical redirects to auth; accessible provider sign-in buttons.
7. `/sss`, `/iletisim`, `/gizlilik`, `/cerez-politikasi`, `/kullanim-kosullari`, `/kvkk-aydinlatma`, and relevant contract/notice pages.
8. Error/maintenance, pending approval, rejected/disabled account and session-expired pages.

## Design and nonfunctional
- Turkish-first content, future i18n-ready; mobile-first 320px+; fast SSR/SEO, semantic headings, metadata, sitemap and robots.
- Marketing pages may use their own brand styling; **admin and superadmin retain one fixed shared UI system**; ten themes apply only to customer menus.
- Accessibility: keyboard navigation, screen reader labels, focus state, reduced motion, WCAG-aligned contrast, loading/error feedback.
- Consent-aware analytics, cookie controls, contact-form spam defenses, privacy notices, no unnecessary tracking.
- Explicit terms and privacy links at signup; record acceptance only where legally applicable and versioned. Do not bundle optional marketing consent into required acceptance.

## Acceptance
LAND-001: CTA routes work and do not imply self-service activation without approval.
LAND-002: all three federated sign-ins and callback/error/cancel flows tested on mobile.
LAND-003: pending account can log in to status page but cannot edit/publish tenant content.
LAND-004: accessible, performant mobile marketing pages; no cross-domain session leak.
LAND-005: legal/SEO claims accurately reflect released capabilities.

## v7 positioning / brand brief (design last)
Marketing language must say cafés AND restaurants, including coffee shops and bakeries; imagery and demos should show both. Apply QMenuX brand tokens from `BRAND_DESIGN_SYSTEM.md`, but do not implement the landing before T043.
