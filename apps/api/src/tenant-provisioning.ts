import { ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { Database } from './database.js';
import { secretHash } from './identity-store.js';
import { OperatorAccess } from './operator-access.js';
import { OperatorPasskeys, type OperatorOperation } from './operator-passkeys.js';
import { fields, integer, invalid, text, uuid } from './request-input.js';
import { tenantSlug } from './tenant-transactions.js';

type Provisioned = QueryResultRow & Readonly<{ applicationId: string; tenantId: string; branchId: string; slug: string; createdAt: Date }>;
function unavailable(error: unknown): never {
  if (error instanceof ForbiddenException || error instanceof ConflictException || error instanceof NotFoundException) throw error;
  const code = (error as { code?: string })?.code;
  if (code === '28000') throw new ForbiddenException();
  if (code === '23505') throw new ConflictException({ status: 'conflict' });
  throw new ServiceUnavailableException({ status: 'unavailable' });
}

// Internal development use case only; no HTTP/BFF route registers provisioning.
@Injectable()
export class TenantProvisioning {
  constructor(private readonly database: Database, private readonly access: OperatorAccess, private readonly passkeys: OperatorPasskeys) {}

  private command(value: unknown, input: unknown) {
    const id = uuid(value), body = fields(input, ['revision','slug','businessName','initialBranchName','reason','requestId']);
    const revision = integer(body.revision, 1, 2147483646), requestId = uuid(body.requestId);
    if (typeof body.slug !== 'string') invalid();
    let slug: string;
    try { slug = tenantSlug(`${body.slug}.qmenux.com`); } catch { invalid(); }
    const businessName = text(body.businessName, 200, true), branchName = text(body.initialBranchName, 200, true);
    const reason = text(body.reason, 1000, true);
    const operation: OperatorOperation = Object.freeze({ action: 'tenant:provision', targetId: id, requestId,
      payloadHash: secretHash(JSON.stringify([revision, slug, businessName, branchName, reason])) });
    return { operation, values: [id, requestId, revision, slug, businessName, branchName, reason] };
  }

  async begin(assertion: unknown, browser: unknown, session: unknown, csrf: unknown, proof: unknown, id: unknown, input: unknown) {
    return this.passkeys.beginStepUp(assertion, browser, session, csrf, proof, this.command(id, input).operation);
  }

  async finish(assertion: unknown, browser: unknown, session: unknown, csrf: unknown, proof: unknown,
    id: unknown, input: unknown, challenge: unknown, response: unknown) {
    return this.passkeys.finishStepUp(assertion, browser, session, csrf, proof, this.command(id, input).operation, challenge, response);
  }

  async provision(assertion: unknown, browser: unknown, session: unknown, csrf: unknown, proof: unknown,
    stepUp: unknown, id: unknown, input: unknown): Promise<Provisioned> {
    const command = this.command(id, input);
    if (process.env.OPERATOR_PASSKEY_ENABLED !== 'true' || process.env.VERCEL_ENV === 'preview'
      || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new ServiceUnavailableException({ status: 'unavailable' });
    if (![browser,session,csrf,proof].every(v => typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v))) throw new ForbiddenException();
    const identity = await this.access.verify(assertion);
    const bindings = [identity.issuer, identity.subject, identity.audience, ...[session,csrf,proof,browser].map(v => secretHash(v as string))];
    const replay = async () => {
      const client = await this.database.begin(); let clean = false;
      try {
        const result = await client.query<Provisioned>('SELECT * FROM qmenux_onboarding.replay_provisioning($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
          [...bindings, ...command.values]);
        await client.query('COMMIT'); clean = true; return result.rows[0];
      } catch (error) {
        try { await client.query('ROLLBACK'); clean = true; } catch { /* Discard an unresettable connection. */ }
        unavailable(error);
      } finally { client.release(!clean); }
    };
    const previous = await replay(); if (previous) return previous;
    try {
      return await this.passkeys.runStepUp(assertion, browser, session, csrf, proof, stepUp, command.operation, async client => {
        try {
          const result = await client.query<Provisioned>('SELECT * FROM qmenux_onboarding.provision_application($1,$2,$3,$4,$5,$6,$7)', command.values);
          if (!result.rows[0]) throw new NotFoundException({ status: 'not_found' });
          return result.rows[0];
        } catch (error) { unavailable(error); }
      });
    } catch (error) {
      if (error instanceof ForbiddenException) { const recorded = await replay(); if (recorded) return recorded; }
      throw error;
    }
  }
}
