# Feature-to-Task Traceability
| Requirement | Task | Tests | Documentation |
|---|---|---|---|
| Geofence radius/province/district | T016 | GEO-001..003 | GEOLOCATION_GEOFENCING.md |
| Full mobile PWA owner/superadmin | T017 | UX-001 | MOBILE_ADMIN_FLOWS.md |
| AI credit locks/quotes | T024 (future) | AI-001 | AI_INTEGRATION.md |
| A4 menu + allergen PDFs | T018 | PDF-001, CT-015 | PDF_EXPORT_SPEC.md |
| Optional guest Wi-Fi | T019 | WIFI-001, CT-013 | UI_UX.md |
| 10 public themes / 1 admin theme | T020 | THEME-001 | THEME_SYSTEM.md |
| Max 1 active image | T021 | IMG-001 | DOMAIN_MODEL.md |
| Total/month QR scans | T022 | QR-001, CT-016 | DATABASE.md |
| License remaining | T010 | subscription tests | SUBSCRIPTION_BILLING.md |

## v4 feature traceability
| Feature | Task | Test | Primary spec |
|---|---|---|---|
| Sold-out / hidden | T025 | AV-001 | CATALOG_WORKFLOWS.md |
| Revision history / restore | T026 | REV-001 | CATALOG_WORKFLOWS.md |
| CSV/XLSX import | T027 | IMP-001 | CATALOG_WORKFLOWS.md |
| Search and filters | T028 | SEARCH-001 | PUBLIC_DISCOVERY.md |
| Table QR | T029 | TABLEQR-001 | PUBLIC_DISCOVERY.md |
| Multilingual | T030 | I18N-001 | PUBLIC_DISCOVERY.md |
| Scheduled menus/prices | T031 | SCH-001 | CATALOG_WORKFLOWS.md |
| Anonymous analytics | T032 | ANA-001 | ENGAGEMENT_ANALYTICS.md |
| WhatsApp CTA | T033 | WA-001 | ENGAGEMENT_ANALYTICS.md |
| PWA push | T034 | PUSH-001 | ENGAGEMENT_ANALYTICS.md |

| QMenuX canonical DNS/host routing | T035 | HOST-001 | DOMAINS_AND_TRUST_BOUNDARIES.md |
| Superadmin isolation, Access/MFA, mobile PWA | T036 | AUTH-001..003, OPS-001 | SECURITY.md, INTEGRATION_SECURITY.md |
| API auth, scopes, versioning, quotas | T037 | API-001..003 | PUBLIC_API_AND_CHANNELS.md |
| API keys, client management and signed webhooks | T038 (later) | API-002, HOOK-001 | PUBLIC_API_AND_CHANNELS.md |
| Telegram/WhatsApp Business adapters | T039 (future) | CHANNEL-001 | PUBLIC_API_AND_CHANNELS.md |


## v6 additions
| Requirement | Task | Test |
|---|---|---|
| OIDC Google/Microsoft/Apple | T040 | AUTH-004..006 |
| Approval-gated signup | T041 | ONB-001..002 |
| No gateway; manual license grant | T042 | PAY-001..003 |
| Landing LAST with login/signup | T043 | LAND-001..005 |
| Identity/privacy/marketing legal review | LEG-012 | LEG-AUTH, LEG-ONBOARD, LEG-MARKETING |

## v7 brand and sector coverage
| Requirement | Task | Evidence |
|---|---|---|
| QMenuX warm shared design tokens | T044 | BRAND-001..004 |
| Business-type starter suggestions | T045 | ONB-003..005 |
| 10 defined public theme briefs | T020, T046 | THEME-002 |
| Landing café + restaurant positioning | T043 | LAND-005, BRAND-002 |


## v8 hosting traceability
| Requirement | Task | Tests |
|---|---|---|
| Vercel Next.js/NestJS deployment spike | T047 | INFRA-001 |
| Neon pooled/direct and RLS | T048 | INFRA-002 |
| Durable external worker + compatible Redis | T049 | INFRA-003 |
| Cloudflare/Vercel wildcard host and access | T050 | INFRA-004 |
| Environment isolation and restore | T051 | INFRA-005 |

## v9 Git governance
| Requirement | Task | Evidence |
|---|---|---|
| Safe existing-repository workflow | T052 | GIT-001 |
| PR validation and secret scanning | T053 | GIT-002 |
