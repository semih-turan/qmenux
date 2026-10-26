'use client';
import { createContext, useContext, type ReactNode } from 'react';
import { can, type Permission } from '@qmenux/contracts';
import type { Me, Role } from '@/lib/types';

interface Session {
  me: Me;
  role: Role;
  tenant: Me['memberships'][number];
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ value, children }: { value: Session; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession outside the authenticated shell');
  return s;
}

/** UI hint only: the API enforces every permission again on the server. */
export function useCan(p: Permission): boolean {
  return can(useSession().role, p);
}
