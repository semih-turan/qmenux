import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { AuthApp } from './oidc-callback.js';
import { fields, integer, invalid, text, uuid } from './request-input.js';
import { TenantAuthorization, type TenantEntitlement } from './tenant-authorization.js';

const columns = 'id, category_id AS "categoryId", name, description, price_minor AS "priceMinor", currency, availability, sort_order AS "sortOrder", revision';
type Product = { id: string; categoryId: string; name: string; description: string; priceMinor: number; currency: 'TRY';
  availability: 'AVAILABLE' | 'SOLD_OUT' | 'HIDDEN'; sortOrder: number; revision: number };
function productInput(value: unknown, create: boolean): Partial<Omit<Product, 'id' | 'currency'>> {
  const keys = ['categoryId', 'name', 'description', 'priceMinor', 'availability', 'sortOrder', ...(create ? [] : ['revision'])];
  const body = fields(value, keys);
  if (create && ['categoryId','name','priceMinor'].some(key => !Object.hasOwn(body, key))) invalid();
  if (!create && (!Object.hasOwn(body, 'revision') || Object.keys(body).length < 2)) invalid();
  const result: Partial<Omit<Product, 'id' | 'currency'>> = {};
  if (Object.hasOwn(body, 'categoryId')) result.categoryId = uuid(body.categoryId);
  if (Object.hasOwn(body, 'name')) result.name = text(body.name, 200, true);
  if (Object.hasOwn(body, 'description')) result.description = text(body.description, 2000, false);
  if (Object.hasOwn(body, 'priceMinor')) result.priceMinor = integer(body.priceMinor);
  if (Object.hasOwn(body, 'sortOrder')) result.sortOrder = integer(body.sortOrder);
  if (Object.hasOwn(body, 'revision')) result.revision = integer(body.revision, 1);
  if (Object.hasOwn(body, 'availability')) {
    if (body.availability !== 'AVAILABLE' && body.availability !== 'SOLD_OUT' && body.availability !== 'HIDDEN') invalid();
    result.availability = body.availability;
  }
  return result;
}

@Injectable()
export class DraftCatalog {
  constructor(private readonly authorization: TenantAuthorization) {}

  private async category(client: PoolClient, id: string): Promise<void> {
    if (!(await client.query('SELECT id FROM qmenux.categories WHERE id=$1', [id])).rows.length) {
      throw new NotFoundException({ status: 'not_found' });
    }
  }

  list(host: unknown, token: unknown, input: unknown, entitled: TenantEntitlement, app: AuthApp = 'api', csrf?: unknown) {
    const body = fields(input, ['categoryId', 'after', 'limit']);
    const category = Object.hasOwn(body, 'categoryId') ? uuid(body.categoryId) : null;
    const after = Object.hasOwn(body, 'after') ? uuid(body.after) : null;
    const limit = Object.hasOwn(body, 'limit') ? integer(body.limit, 1, 100) : 20;
    return this.authorization.run(host, token, 'catalog:read', entitled, async client => {
      if (category) await this.category(client, category);
      const { rows } = await client.query<Product>(`SELECT ${columns} FROM qmenux.products
        WHERE ($1::uuid IS NULL OR category_id=$1) AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3`, [category, after, limit + 1]);
      return { items: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1]!.id : null };
    }, app, csrf);
  }

  read(host: unknown, token: unknown, value: unknown, entitled: TenantEntitlement, app: AuthApp = 'api', csrf?: unknown) {
    const id = uuid(value);
    return this.authorization.run(host, token, 'catalog:read', entitled, async client => {
      const product = (await client.query<Product>(`SELECT ${columns} FROM qmenux.products WHERE id=$1`, [id])).rows[0];
      if (!product) throw new NotFoundException({ status: 'not_found' });
      return product;
    }, app, csrf);
  }

  create(host: unknown, token: unknown, input: unknown, entitled: TenantEntitlement, app: AuthApp = 'api', csrf?: unknown) {
    const body = productInput(input, true);
    return this.authorization.run(host, token, 'catalog:write', entitled, async (client, tenant) => {
      await this.category(client, body.categoryId!);
      await client.query("SELECT set_config('app.catalog_actor',$1,true)", [tenant.userId]);
      return (await client.query<Product>(`INSERT INTO qmenux.products(tenant_id,category_id,name,description,price_minor,availability,sort_order)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${columns}`, [tenant.id, body.categoryId, body.name, body.description ?? '',
        body.priceMinor, body.availability ?? 'AVAILABLE', body.sortOrder ?? 0])).rows[0]!;
    }, app, csrf);
  }

  update(host: unknown, token: unknown, value: unknown, input: unknown, entitled: TenantEntitlement, app: AuthApp = 'api', csrf?: unknown) {
    const id = uuid(value), body = productInput(input, false);
    return this.authorization.run(host, token, 'catalog:write', entitled, async (client, tenant) => {
      if (body.categoryId) await this.category(client, body.categoryId);
      await client.query("SELECT set_config('app.catalog_actor',$1,true)", [tenant.userId]);
      const product = (await client.query<Product>(`UPDATE qmenux.products SET category_id=COALESCE($3,category_id),
        name=COALESCE($4,name), description=COALESCE($5,description), price_minor=COALESCE($6,price_minor),
        availability=COALESCE($7,availability), sort_order=COALESCE($8,sort_order)
        WHERE id=$1 AND revision=$2 RETURNING ${columns}`, [id, body.revision, body.categoryId ?? null, body.name ?? null,
        body.description ?? null, body.priceMinor ?? null, body.availability ?? null, body.sortOrder ?? null])).rows[0];
      if (product) return product;
      if (!(await client.query('SELECT id FROM qmenux.products WHERE id=$1', [id])).rows.length) throw new NotFoundException({ status: 'not_found' });
      throw new ConflictException({ status: 'conflict' });
    }, app, csrf);
  }

  history(host: unknown, token: unknown, value: unknown, input: unknown, entitled: TenantEntitlement, app: AuthApp = 'api', csrf?: unknown) {
    const id = uuid(value), body = fields(input, ['afterRevision', 'limit']);
    const after = Object.hasOwn(body, 'afterRevision') ? integer(body.afterRevision) : 0;
    const limit = Object.hasOwn(body, 'limit') ? integer(body.limit, 1, 100) : 20;
    return this.authorization.run(host, token, 'catalog:read', entitled, async client => {
      if (!(await client.query('SELECT id FROM qmenux.products WHERE id=$1', [id])).rows.length) throw new NotFoundException({ status: 'not_found' });
      const { rows } = await client.query<{ revision: number; actorId: string; occurredAt: Date; previous: unknown; current: unknown }>(
        `SELECT revision, actor_id AS "actorId", occurred_at AS "occurredAt", previous, current FROM qmenux.product_events
        WHERE product_id=$1 AND revision>$2 ORDER BY revision LIMIT $3`, [id, after, limit + 1]);
      return { items: rows.slice(0, limit), nextRevision: rows.length > limit ? rows[limit - 1]!.revision : null };
    }, app, csrf);
  }
}
