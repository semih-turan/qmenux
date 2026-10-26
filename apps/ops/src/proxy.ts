import { NextResponse, type NextRequest } from 'next/server';

/**
 * Server components cannot see the requested URL, so the gate could only send people back to "/"
 * after a re-login. The proxy forwards the path (same-origin only, validated again by safeReturnTo
 * before use) as a request header that layouts read.
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set('x-qx-path', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/((?!_next/|bff/|auth/|icon.svg|manifest.webmanifest).*)'],
};
