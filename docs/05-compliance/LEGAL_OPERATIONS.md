# Legal Operations

> Working compliance specification · 2026-10-25 · Requires qualified legal/accounting review before production.

## Parties and accountability
Platform provider (Bisetra or future operating entity), restaurant merchant, public menu visitor, admin staff, payment processor, AI processor, hosting/subprocessors. Legal counsel must map data-controller vs processor roles **per processing purpose**, not globally.

## Launch workflow
1. Confirm contracting legal entity, tax registrations and invoice workflow with accountant.
2. Counsel approves merchant agreement, privacy notices, processor agreement where needed, cookie policy and support/termination language.
3. Confirm merchant legal name, branch count, food classification, contact and physical-menu acknowledgement.
4. Publish versioned contract and notices; record acceptance version, timestamp, user, tenant and evidence.
5. Maintain subprocessor register, breach response contacts, retention schedule, data export/deletion procedure.
6. Validate production configuration, backups, RLS, payment callback signing, complaint channels and accessibility.
7. Release only after signed checklist and unresolved blocker review.

## Ongoing cadence
Monthly regulatory source review; event-driven review after changes in law, payment provider, analytics/AI subprocessors, storage region or product scope. Retain versioned change log and approvals. Use scheduled internal task, not unverified automatic changes to legal policy.

## Incident process
Contain, record timeline and affected tenants, consult counsel on notification obligations and timelines, preserve evidence securely, notify as legally required, document remediation. Do not hardcode universal breach-notification periods without legal verification.
