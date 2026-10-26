import type { MetadataRoute } from 'next';
import { LEGAL, NAV, SITE } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return ['/', ...NAV.map((n) => n.href), '/iletisim', ...LEGAL.map((n) => n.href)].map((p) => ({ url: `${SITE.origin}${p}`, lastModified: now }));
}
