import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ToastProvider } from '@qmenux/ui';
import '@qmenux/ui/styles.css';
import './ops.css';

export const metadata: Metadata = {
  title: { default: 'QMenuX Platform', template: '%s · QMenuX Platform' },
  description: 'QMenuX platform operasyonları: başvurular, işletmeler ve lisanslar.',
  applicationName: 'QMenuX Platform',
  robots: { index: false, follow: false, nocache: true },
  appleWebApp: { capable: true, title: 'QMenuX Platform', statusBarStyle: 'default' },
  formatDetection: { telephone: false, email: false },
  icons: { icon: { url: '/icon.svg', type: 'image/svg+xml' } },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  // Matches --qx-canvas, the colour at the top of every screen (same fixed system as the admin PWA).
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f5f0' },
    { media: '(prefers-color-scheme: dark)', color: '#161512' },
  ],
  colorScheme: 'light dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
