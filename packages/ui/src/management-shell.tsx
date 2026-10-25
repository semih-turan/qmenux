import type { ReactNode } from 'react';

export function ManagementShell({ title, children }: { title: string; children: ReactNode }) {
  return <main className="management-shell"><p className="brand">QMenuX</p><h1>{title}</h1>{children}</main>;
}
