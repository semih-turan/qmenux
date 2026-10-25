# Deployment Decision Record — ADR-DEPLOY-008
Date: 2026-10-25 | Status: Accepted for Neon and Vercel; other provider choices pending.

## Decision
Neon PostgreSQL is the canonical database. Vercel is the primary frontend and HTTP API deployment platform. Cloudflare R2 remains object storage. Separate durable worker hosting is required for long-running tasks; worker provider is not decided.

## Superseded assumptions
- Earlier references to generic self-hosted PostgreSQL as the primary production database are superseded by Neon.
- Earlier references to Docker deployment for every app are superseded by Vercel for frontends/API. Docker remains useful for local development and externally hosted workers.
- Earlier 'all services on one VPS' assumptions are not approved.
- Vercel Functions cannot be assumed to host always-on BullMQ consumers.
- Redis vendor and ORM are recommendations, not finalized choices.

## Open decisions
- External worker host and cost budget.
- Redis queue backend, BullMQ compatibility, cache provider and retry/DLQ approach.
- Drizzle vs Prisma and Neon driver/RLS transaction semantics.
- Vercel plan/limits, preferred region, Neon region and cross-border KVKK analysis.
- Neon backup/PITR/restore SLA and production incident procedures.
- Cloudflare proxy/DNS configuration for wildcard tenant subdomains and Vercel.

## Change control
New provider choices must be documented in DECISIONS.md and reflected in TASKS.md, architecture and operations docs before implementation.
