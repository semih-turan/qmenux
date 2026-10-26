/** Browser-safe (no Node imports): shared by the MFA form, the grant sheet and the /auth/mfa route. */

/** A six-digit TOTP code as typed on a phone keypad (spaces tolerated), or null. */
export function normalizeOtp(v: string): string | null {
  const d = v.replace(/\s+/g, '');
  return /^\d{6}$/.test(d) ? d : null;
}
