'use client';
import { createContext, useContext, type ReactNode } from 'react';
import type { OpsSession } from '@/lib/types';

const Ctx = createContext<OpsSession | null>(null);

export function SessionProvider({ value, children }: { value: OpsSession; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOperator(): OpsSession {
  const s = useContext(Ctx);
  if (!s) throw new Error('useOperator outside the operator shell');
  return s;
}

/** UI hint only: the API requires PLATFORM_ADMIN again for every mutation. */
export function useIsAdmin(): boolean {
  return useOperator().role === 'PLATFORM_ADMIN';
}
