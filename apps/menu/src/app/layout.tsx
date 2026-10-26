import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { SwRegister } from '@/components/sw-register';
import './menu.css';

export const metadata: Metadata = {
  title: { default: 'Menü', template: '%s · Menü' },
  applicationName: 'QMenuX',
  // Tenant menus are reached by QR, not search; indexing is the owner's decision in a later release.
  robots: { index: false, follow: false },
  formatDetection: { telephone: false, address: false, email: false },
  icons: { icon: { url: '/icon.svg', type: 'image/svg+xml' } },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // data-qx-offline is flipped to "1" by the service worker when it serves the saved copy.
    <html lang="tr" data-qx-offline="0" suppressHydrationWarning>
      <body>
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
