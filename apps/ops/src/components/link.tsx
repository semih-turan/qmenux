'use client';
import NextLink from 'next/link';
import type { ReactNode } from 'react';

/** Adapter so @qmenux/ui (framework-free) can render Next.js client-side links. */
export function Link(props: { href: string; className?: string; children?: ReactNode; 'aria-current'?: 'page' | undefined; prefetch?: boolean }) {
  return <NextLink {...props} />;
}
