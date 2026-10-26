import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@qmenux/ui/styles.css';
import './landing.css';
import { Footer, Header } from '@/components/chrome';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  metadataBase: new URL(SITE.origin),
  title: { default: 'QMenuX — Kafe ve restoranlar için QR menü', template: '%s · QMenuX' },
  description: 'Menünüzü telefondan yönetin, QR kodla paylaşın. Kafeler, kahve dükkânları, pastaneler ve restoranlar için on tema, A4 PDF, okutma raporları.',
  applicationName: 'QMenuX',
  openGraph: { type: 'website', siteName: 'QMenuX', locale: 'tr_TR', title: 'QMenuX — Kafe ve restoranlar için QR menü', description: 'Menünüzü telefondan yönetin, QR kodla paylaşın.' },
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
  icons: { icon: { url: '/icon.svg', type: 'image/svg+xml' } },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
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
        <a className="qx-skip-link" href="#icerik">
          İçeriğe geç
        </a>
        <Header />
        <main id="icerik" tabIndex={-1}>
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
