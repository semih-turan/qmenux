import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ToastProvider } from '@qmenux/ui';
import '@qmenux/ui/styles.css';
import './admin.css';

export const metadata: Metadata = {
  title: { default: 'QMenuX İşletme Paneli', template: '%s · QMenuX' },
  description: 'Kafe ve restoran menünüzü telefondan yönetin.',
  applicationName: 'QMenuX',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'QMenuX', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
  icons: { icon: { url: '/icon.svg', type: 'image/svg+xml' } },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  // Matches --qx-canvas, the colour at the top of every screen.
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
