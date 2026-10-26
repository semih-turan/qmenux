/** Host derivation mirrors the API config: qmenux.localhost in development, qmenux.com in production. */
const root = process.env.QX_ROOT_DOMAIN ?? 'qmenux.localhost';
const local = root.endsWith('.localhost') || root === 'localhost';

export const SITE = {
  name: 'QMenuX',
  root,
  origin: process.env.QX_LANDING_ORIGIN || (local ? `http://${root}:3003` : `https://${root}`),
  adminOrigin: process.env.QX_ADMIN_ORIGIN || (local ? `http://admin.${root}:3011` : `https://admin.${root}`),
  demoMenu: local ? `http://demo-kahve.${root}:3000` : `https://demo-kahve.${root}`,
  contactEmail: 'merhaba@qmenux.com',
};

export const NAV = [
  { href: '/ozellikler', label: 'Özellikler' },
  { href: '/nasil-calisir', label: 'Nasıl çalışır' },
  { href: '/temalar', label: 'Temalar' },
  { href: '/fiyatlandirma', label: 'Fiyatlandırma' },
  { href: '/sss', label: 'SSS' },
];

export const LEGAL = [
  { href: '/gizlilik', label: 'Gizlilik bildirimi' },
  { href: '/cerez-politikasi', label: 'Çerez politikası' },
  { href: '/kullanim-kosullari', label: 'Kullanım koşulları' },
  { href: '/kvkk-aydinlatma', label: 'KVKK aydınlatma metni' },
];
