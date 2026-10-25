import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthApp } from './oidc-callback.js';
import { fields, integer, invalid, text, uuid } from './request-input.js';
import { TenantAuthorization, type TenantEntitlement } from './tenant-authorization.js';

type StructureKind = 'menu' | 'category';
type Structure = { id: string; name: string; revision: number } &
  ({ branchId: string; state: 'DRAFT' } | { menuId: string; sortOrder: number });
const definitions = {
  menu: { table: 'qmenux.menus', events: 'qmenux.menu_events', parent: 'branch_id', key: 'branchId',
    columns: 'id,branch_id AS "branchId",name,state,revision' },
  category: { table: 'qmenux.categories', events: 'qmenux.category_events', parent: 'menu_id', key: 'menuId',
    columns: 'id,menu_id AS "menuId",name,sort_order AS "sortOrder",revision' },
} as const;
function definition(kind: StructureKind) {
  if (kind !== 'menu' && kind !== 'category') invalid();
  return definitions[kind];
}

@Injectable()
export class DraftStructure {
  constructor(private readonly authorization: TenantAuthorization) {}

  list(kind: StructureKind, host: unknown, token: unknown, input: unknown, entitled: TenantEntitlement, app: AuthApp = 'api', csrf?: unknown) {
    const spec = definition(kind), body = fields(input, [spec.key, 'after', 'limit']);
    const parent = Object.hasOwn(body, spec.key) ? uuid(body[spec.key]) : null;
    const after = Object.hasOwn(body, 'after') ? uuid(body.after) : null;
    const limit = Object.hasOwn(body, 'limit') ? integer(body.limit, 1, 100) : 20;
    return this.authorization.run(host, token, 'catalog:read', entitled, async client => {
      const { rows } = await client.query<Structure>(`SELECT ${spec.columns} FROM ${spec.table}
        WHERE ($1::uuid IS NULL OR ${spec.parent}=$1) AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3`, [parent, after, limit + 1]);
      return { items: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1]!.id : null };
    }, app, csrf);
  }

  read(kind: StructureKind, host: unknown, token: unknown, value: unknown, entitled: TenantEntitlement, app: AuthApp = 'api', csrf?: unknown) {
    const spec = definition(kind), id = uuid(value);
    return this.authorization.run(host, token, 'catalog:read', entitled, async client => {
      const entity = (await client.query<Structure>(`SELECT ${spec.columns} FROM ${spec.table} WHERE id=$1`, [id])).rows[0];
      if (!entity) throw new NotFoundException({ status: 'not_found' });
      return entity;
    }, app, csrf);
  }

  create(kind: StructureKind, host: unknown, token: unknown, input: unknown, entitled: TenantEntitlement, app: AuthApp = 'api', csrf?: unknown) {
    const spec = definition(kind), body = fields(input, [spec.key, 'name', ...(kind === 'category' ? ['sortOrder'] : [])]);
    const parent = uuid(body[spec.key]), name = text(body.name, 200, true);
    const order = Object.hasOwn(body, 'sortOrder') ? integer(body.sortOrder) : 0;
    return this.authorization.run(host, token, 'catalog:write', entitled, async (client, tenant) => {
      await client.query("SELECT set_config('app.catalog_actor',$1,true)", [tenant.userId]);
      try {
        return (await client.query<Structure>(`INSERT INTO ${spec.table}(tenant_id,${spec.parent},name${kind === 'category' ? ',sort_order' : ''})
          VALUES ($1,$2,$3${kind === 'category' ? ',$4' : ''}) RETURNING ${spec.columns}`,
        [tenant.id, parent, name, ...(kind === 'category' ? [order] : [])])).rows[0]!;
      } catch (error) {
        // A foreign or missing parent has the same response; never query another module's branch table.
        if ((error as { code?: string }).code === '23503') throw new NotFoundException({ status: 'not_found' });
        throw error;
      }
    }, app, csrf);
  }

  update(kind: StructureKind, host: unknown, token: unknown, value: unknown, input: unknown, entitled: TenantEntitlement, app: AuthApp = 'api', csrf?: unknown) {
    const spec = definition(kind), id = uuid(value), body = fields(input, ['revision','name', ...(kind === 'category' ? ['sortOrder'] : [])]);
    if (!Object.hasOwn(body, 'revision') || Object.keys(body).length < 2) invalid();
    const revision = integer(body.revision, 1), name = Object.hasOwn(body, 'name') ? text(body.name, 200, true) : null;
    const order = Object.hasOwn(body, 'sortOrder') ? integer(body.sortOrder) : null;
    return this.authorization.run(host, token, 'catalog:write', entitled, async (client, tenant) => {
      await client.query("SELECT set_config('app.catalog_actor',$1,true)", [tenant.userId]);
      const entity = (await client.query<Structure>(`UPDATE ${spec.table} SET name=COALESCE($3,name)${kind === 'category' ? ',sort_order=COALESCE($4,sort_order)' : ''}
        WHERE id=$1 AND revision=$2 RETURNING ${spec.columns}`, [id,revision,name, ...(kind === 'category' ? [order] : [])])).rows[0];
      if (entity) return entity;
      if (!(await client.query(`SELECT id FROM ${spec.table} WHERE id=$1`, [id])).rows.length) throw new NotFoundException({ status: 'not_found' });
      throw new ConflictException({ status: 'conflict' });
    }, app, csrf);
  }

  history(kind: StructureKind, host: unknown, token: unknown, value: unknown, input: unknown, entitled: TenantEntitlement, app: AuthApp = 'api', csrf?: unknown) {
    const spec = definition(kind), id = uuid(value), body = fields(input, ['afterRevision','limit']);
    const after = Object.hasOwn(body, 'afterRevision') ? integer(body.afterRevision) : 0;
    const limit = Object.hasOwn(body, 'limit') ? integer(body.limit, 1, 100) : 20;
    return this.authorization.run(host, token, 'catalog:read', entitled, async client => {
      if (!(await client.query(`SELECT id FROM ${spec.table} WHERE id=$1`, [id])).rows.length) throw new NotFoundException({ status: 'not_found' });
      const { rows } = await client.query<{ revision: number; actorId: string; occurredAt: Date; previous: unknown; current: unknown }>(
        `SELECT revision,actor_id AS "actorId",occurred_at AS "occurredAt",previous,current FROM ${spec.events}
        WHERE entity_id=$1 AND revision>$2 ORDER BY revision LIMIT $3`, [id, after, limit + 1]);
      return { items: rows.slice(0, limit), nextRevision: rows.length > limit ? rows[limit - 1]!.revision : null };
    }, app, csrf);
  }
}
