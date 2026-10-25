import { ForbiddenException, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { IdentityStore, type TenantMembership } from './identity-store.js';
import { TenantTransactions, type TenantContext } from './tenant-transactions.js';

export type TenantPermission = 'catalog:read' | 'catalog:write' | 'membership:manage';
const grants: Record<TenantPermission, ReadonlySet<TenantMembership['role']>> = {
  'catalog:read': new Set(['OWNER', 'EDITOR']),
  'catalog:write': new Set(['OWNER', 'EDITOR']),
  'membership:manage': new Set(['OWNER']),
};
export type TenantEntitlement = (tenant: TenantContext, client: PoolClient) => Promise<boolean>;
export type AuthorizedTenant = Readonly<TenantContext & TenantMembership>;

@Injectable()
export class TenantAuthorization {
  constructor(private readonly transactions: TenantTransactions, private readonly identities: IdentityStore) {}

  async run<T>(host: unknown, token: unknown, permission: TenantPermission,
    entitled: TenantEntitlement,
    work: (client: PoolClient, tenant: AuthorizedTenant) => Promise<T>): Promise<T> {
    if (typeof token !== 'string' || !/^[a-zA-Z0-9_-]{43}$/.test(token)
      || typeof permission !== 'string' || !Object.hasOwn(grants, permission)
      || typeof entitled !== 'function') throw new ForbiddenException();
    let membership: TenantMembership | undefined;
    return this.transactions.run(host, async (tenant, client) => {
      membership = await this.identities.tenantMembership(client, token);
      return !!membership && grants[permission].has(membership.role) && await entitled(tenant, client) === true;
    }, (client, tenant) => {
      if (!membership) throw new ForbiddenException();
      return work(client, Object.freeze({ ...tenant, ...membership }));
    });
  }
}
