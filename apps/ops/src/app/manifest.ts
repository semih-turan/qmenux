import type { MetadataRoute } from 'next';

/** Installable shell only: there is no service worker, so no operator data is ever cached on the device. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'QMenuX Platform',
    short_name: 'QMX Platform',
    description: 'QMenuX platform operasyonları: başvurular, işletmeler ve lisanslar.',
    lang: 'tr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f7f5f0',
    theme_color: '#f7f5f0',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
