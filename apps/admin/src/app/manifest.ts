import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'QMenuX İşletme Paneli',
    short_name: 'QMenuX',
    description: 'Kafe ve restoran menünüzü telefondan yönetin.',
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
