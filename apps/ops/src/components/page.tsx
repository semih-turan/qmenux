'use client';
import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import NextLink from 'next/link';
import { AppBar, Main } from '@qmenux/ui';

/** Screen frame: app bar (optional back link) + main region. */
export function Page({ title, subtitle, back, actions, children }: { title: ReactNode; subtitle?: ReactNode; back?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <>
      <AppBar
        title={title}
        subtitle={subtitle}
        leading={
          back ? (
            <NextLink href={back} className="qx-iconbtn" aria-label="Geri">
              <ChevronLeft size={22} aria-hidden="true" />
            </NextLink>
          ) : undefined
        }
        actions={actions}
      />
      <Main>
        <div className="qx-stack">{children}</div>
      </Main>
    </>
  );
}
