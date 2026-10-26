import { redirect } from 'next/navigation';
import { SITE } from '@/lib/site';

/** Canonical login lives on the admin host (one identity store, no shared cookies with the marketing site). */
export default function LoginRedirect() {
  redirect(`${SITE.adminOrigin}/login`);
}
