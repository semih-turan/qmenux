import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const b64u = (buf: Buffer) => buf.toString('base64url');

/** High-entropy opaque token (sessions, invites, QR tables, OIDC state). */
export function randomToken(bytes = 32): string {
  return b64u(randomBytes(bytes));
}

/**
 * Only HMACs of tokens are stored. The purpose prefix keeps a token of one kind
 * from ever matching a hash of another kind.
 */
export function hashToken(pepper: Buffer, purpose: 'session' | 'invite' | 'qr' | 'state' | 'rl', token: string): string {
  return b64u(createHmac('sha256', pepper).update(`${purpose}:${token}`).digest());
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomToken(48);
  return { verifier, challenge: b64u(createHash('sha256').update(verifier).digest()) };
}

export function pkceChallenge(verifier: string): string {
  return b64u(createHash('sha256').update(verifier).digest());
}

// ---------------------------------------------------------------- AES-256-GCM at rest
/** `aad` binds a ciphertext to its owner (e.g. `wifi:<branchId>`), so it cannot be replayed elsewhere. */
export function encrypt(key: Buffer, plaintext: string, aad: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plaintext, 'utf8'), c.final()]);
  return `v1:${b64u(iv)}:${b64u(ct)}:${b64u(c.getAuthTag())}`;
}

export function decrypt(key: Buffer, payload: string, aad: string): string {
  const [v, iv, ct, tag] = payload.split(':');
  if (v !== 'v1' || !iv || ct === undefined || !tag) throw new Error('unsupported ciphertext');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}

// ---------------------------------------------------------------- signed short-lived passes
/** Compact HMAC-signed claims (geo pass, dev IdP code). Not a JWT; never sent to third parties. */
export function signPass(pepper: Buffer, purpose: string, claims: Record<string, unknown>): string {
  const body = b64u(Buffer.from(JSON.stringify(claims)));
  const sig = b64u(createHmac('sha256', pepper).update(`pass:${purpose}:${body}`).digest());
  return `${body}.${sig}`;
}

export function verifyPass<T extends { exp: number }>(pepper: Buffer, purpose: string, token: string, nowS = Date.now() / 1000): T | null {
  const [body, sig] = token.split('.');
  if (!body || !sig || token.length > 2048) return null;
  const expected = createHmac('sha256', pepper).update(`pass:${purpose}:${body}`).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
    return typeof claims.exp === 'number' && claims.exp > nowS ? claims : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- TOTP (RFC 6238, SHA-1, 30 s, 6 digits)
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function hotp(secret: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', secret).update(msg).digest();
  const off = h[h.length - 1]! & 0xf;
  const code = ((h[off]! & 0x7f) << 24) | (h[off + 1]! << 16) | (h[off + 2]! << 8) | h[off + 3]!;
  return String(code % 1_000_000).padStart(6, '0');
}

export const totpStep = (nowMs = Date.now()) => Math.floor(nowMs / 30_000);

/** Returns the matched time-step (±1 step drift) or null. The caller must burn the step (replay protection). */
export function verifyTotp(secret: Buffer, code: string, nowMs = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const now = totpStep(nowMs);
  for (const step of [now, now - 1, now + 1]) {
    const expected = Buffer.from(hotp(secret, step));
    if (timingSafeEqual(expected, Buffer.from(code))) return step;
  }
  return null;
}

export function otpauthUri(secretB32: string, account: string): string {
  return `otpauth://totp/${encodeURIComponent(`QMenuX Ops:${account}`)}?secret=${secretB32}&issuer=QMenuX%20Ops&algorithm=SHA1&digits=6&period=30`;
}
