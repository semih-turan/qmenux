# QMenuX Domains, Routing and Trust Boundaries
Status: Approved hostname decisions (2026-10-25); implementation controls proposed.

## Canonical production hostnames
| Hostname | Purpose | Audience | Protection |
|---|---|---|---|
| `qmenux.com` / `www.qmenux.com` | marketing/legal | public | CDN/WAF |
| `admin.qmenux.com` | tenant owner/staff mobile-first PWA | authenticated business users | OIDC/session, MFA support, tenant RBAC |
| `superman.qmenux.com` | platform superadmin mobile-first PWA | approved platform operators | Cloudflare Access/IdP + mandatory phishing-resistant MFA + server-side platform RBAC |
| `api.qmenux.com` | versioned platform API, first-party and external integrations | authenticated clients, public read endpoints where explicitly defined | separate auth modes, scopes, rate limits, auditing |
| `{slug}.qmenux.com` | guest public menu | guests | public-read boundaries; optional geo visibility |

`admin`, `superman`, `api`, `www` and other reserved subdomains are NOT valid tenant slugs. Reject tenant names conflicting with reserved hosts. Canonicalize hostnames and validate trusted Host/X-Forwarded-Host only behind known proxy; prevent host-header injection and arbitrary tenant resolution.

## Browser/session isolation
- Do NOT issue cookies scoped to `.qmenux.com`. Use host-only `__Host-` secure HttpOnly cookies (Secure; Path=/; no Domain) for first-party sessions; CSRF protection on state changes; SameSite according to tested auth flows.
- Never share privileged superadmin session cookies with admin or guest subdomains. Separate auth audience/client, token signing validation, permissions and logout flows.
- Explicit allowlist for CORS origins and credentialed requests; do not wildcard `*.qmenux.com` for authenticated APIs. Do not trust Origin as authentication.
- API tokens must be audience- and scope-restricted; a tenant admin session is never equivalent to a platform operator session.
- Public menu requests can be served via a public read API with only published tenant data; avoid exposing private tenant or Wi-Fi secrets when disabled.

## Deployment / edge
- Wildcard DNS/certificate for guest tenant subdomains with separate explicit DNS records for privileged hosts; certificate issuance and renewals monitored.
- Superadmin behind Cloudflare Access (or equivalent identity-aware proxy) with deny-by-default policy. API independently checks platform authorization even when edge permits request. Test mobile PWA installation, auth redirects and service worker behavior under Access.
- Ensure production/staging separation: staging hosts and databases must not reuse production credentials.
- Public robots indexing: prevent indexing admin/superadmin; `robots.txt` is not an access control.

## Operational requirements
- Platform operations must be available via phone PWA, with session reauthentication for high-impact actions (license grants, role changes, integration secrets, refunds).
- Restrict superadmin service-worker cache to static assets, not confidential HTML/API responses; `Cache-Control: no-store` for sensitive responses.
- Document origin routing and security test matrix in deployment/testing docs.


## v6 apex sign-in and account approval
- `qmenux.com` marketing page includes Login/Sign up CTAs **when landing is implemented last**. Early operational auth pages can live at `admin.qmenux.com`.
- Google, Microsoft and Apple provider login redirect/callbacks must be exact-allowlisted and must not share superadmin session.
- `superman.qmenux.com` controls pending applications and manual licenses; normal user signup never confers platform role.
- `api.qmenux.com` authorization always verifies tenant approval/license, including external client integrations.
