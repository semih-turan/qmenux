# Multi-Tenancy Security

> Status: Draft v0.1 | Date: 2026-10-25 | Owner: Product/Engineering | Review before production.

## Tenant resolution
Parse and normalize trusted host after proxy validation; allow only configured base domain and verified custom domains. Reject unknown, homograph-risk and reserved subdomains. Resolve hostname -> tenant -> branch/publication. Authenticated admin tenant selection must be membership-authorized server-side.

## Isolation defense in depth
1. Tenant context created on trusted server boundary.
2. Authorization checks membership and role per use case.
3. All tenant tables scoped via PostgreSQL RLS; missing context denied.
4. Object storage keys and signed URLs tenant-bound and time-limited.
5. Cache keys include tenant, branch, locale, revision and authorization class.
6. Queue payloads include signed/trusted tenant reference, revalidated by worker.
7. Analytics/export/search enforce tenant filters; logs avoid sensitive payloads.

## Test matrix
Cross-tenant GET, PATCH, DELETE, list, search, bulk export, media URL, cache poisoning, queue replay, custom domain collision, multi-membership switching, expired role, missing RLS context and concurrency under pooled connections.

## Platform owner
Separate platform authorization and MFA; optional Zero Trust/IP policy; audit all support access. Never give a business account a bypass-RLS DB credential. Support impersonation requires explicit, time-limited, visible audited session.

## External principal tenant resolution
For integration requests, tenant scope comes from verified credential/token claims and server-side mapping, not a client-supplied `tenant_id`, hostname alone, query parameter or Telegram/WhatsApp chat identifier. Branch restrictions and RLS remain active. A platform principal must use explicitly audited platform-only use cases.
