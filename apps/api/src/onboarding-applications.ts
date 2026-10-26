import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Database } from './database.js';
import { secretHash } from './identity-store.js';
import { fields, integer, text, uuid } from './request-input.js';

type Application = { id: string; requestedName: string; status: 'DRAFT' | 'PENDING_APPROVAL' | 'REJECTED'; revision: number;
  createdAt: Date; submittedAt: Date | null };
function credential(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw new UnauthorizedException({ status: 'unauthorized' });
  return secretHash(value);
}

@Injectable()
export class OnboardingApplications {
  constructor(private readonly database: Database) {}

  private async query(sql: string, values: (string | number | null)[]): Promise<Application[]> {
    const client = await this.database.begin();
    let clean = false;
    try {
      const { rows } = await client.query<Application>(sql, values);
      await client.query('COMMIT'); clean = true;
      return rows;
    } catch (error) {
      try { await client.query('ROLLBACK'); clean = true; } catch { /* Destroy a connection with unresettable context. */ }
      const code = (error as { code?: string } | null)?.code;
      if (code === '28000') throw new UnauthorizedException({ status: 'unauthorized' });
      if (code === '23505') throw new ConflictException({ status: 'conflict' });
      throw new ServiceUnavailableException({ status: 'unavailable' });
    } finally { client.release(!clean); }
  }

  async list(session: unknown, input: unknown) {
    const token = credential(session), body = fields(input, ['after','limit']);
    const after = Object.hasOwn(body, 'after') ? uuid(body.after) : null;
    const limit = Object.hasOwn(body, 'limit') ? integer(body.limit, 1, 100) : 20;
    const rows = await this.query('SELECT * FROM qmenux_onboarding.list_applications($1,$2,$3)', [token, after, limit + 1]);
    return { items: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1]!.id : null };
  }

  async create(session: unknown, csrf: unknown, input: unknown): Promise<Application> {
    const token = credential(session), proof = credential(csrf), body = fields(input, ['name','idempotencyKey']);
    const name = text(body.name, 200, true), key = uuid(body.idempotencyKey);
    const rows = await this.query('SELECT * FROM qmenux_onboarding.create_draft($1,$2,$3,$4)', [token, proof, key, name]);
    if (!rows[0]) throw new NotFoundException({ status: 'not_found' });
    return rows[0];
  }

  async edit(session: unknown, csrf: unknown, value: unknown, input: unknown): Promise<Application> {
    const token = credential(session), proof = credential(csrf), id = uuid(value), body = fields(input, ['name','revision']);
    const name = text(body.name, 200, true), revision = integer(body.revision, 1);
    const rows = await this.query('SELECT * FROM qmenux_onboarding.edit_draft($1,$2,$3,$4,$5)', [token, proof, id, revision, name]);
    if (!rows[0]) throw new NotFoundException({ status: 'not_found' });
    return rows[0];
  }

  async submit(session: unknown, csrf: unknown, value: unknown, input: unknown): Promise<Application> {
    const token = credential(session), proof = credential(csrf), id = uuid(value), body = fields(input, ['revision']);
    const revision = integer(body.revision, 1);
    const rows = await this.query('SELECT * FROM qmenux_onboarding.submit_draft($1,$2,$3,$4)', [token, proof, id, revision]);
    if (!rows[0]) throw new NotFoundException({ status: 'not_found' });
    return rows[0];
  }
}
