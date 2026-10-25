import 'reflect-metadata';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { OperatorAccess } from '../src/operator-access.js';

test('operator Access verifies dedicated signed identity without granting privileges', async (t) => {
  const env = { ...process.env };
  const originalFetch = globalThis.fetch;
  const issuer = 'https://synthetic-qmenux.cloudflareaccess.com';
  const audience = 'a'.repeat(64);
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const rotated = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const attacker = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = (key: typeof pair.publicKey, kid: string) => ({ ...key.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' });
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: issuer, aud: [audience], sub: 'synthetic-operator', type: 'app', iat: now, nbf: now, exp: now + 3600 };
  const token = (changes: Record<string, unknown> = {}, header: Record<string, unknown> = {}, key = pair.privateKey) => {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'RS256', typ: 'JWT', kid: 'first', ...header })}.${encode({ ...claims, ...changes })}`;
    return `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), key).toString('base64url')}`;
  };
  let requests = 0;
  let mode: 'normal' | 'rotate' | 'redirect' | 'broken' | 'timeout' = 'normal';
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), `${process.env.OPERATOR_ACCESS_ISSUER}/cdn-cgi/access/certs`);
    assert.equal(init?.redirect, 'manual');
    assert(init?.signal);
    requests++;
    if (mode === 'timeout') return new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
    });
    if (mode === 'redirect') return new Response(null, { status: 302, headers: { location: 'https://attacker.invalid/keys' } });
    if (mode === 'broken') return Response.json({ keys: 'invalid' });
    return Response.json({ keys: mode === 'rotate' ? [jwk(rotated.publicKey, 'second')] : [jwk(pair.publicKey, 'first')] });
  };
  const configure = () => {
    process.env.OPERATOR_ACCESS_ENABLED = 'true';
    process.env.OPERATOR_ACCESS_ISSUER = issuer;
    process.env.OPERATOR_ACCESS_AUDIENCE = audience;
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  };
  try {
    configure();
    const access = new OperatorAccess();
    for (const [name, value] of [
      ['OPERATOR_ACCESS_ENABLED', 'false'], ['OPERATOR_ACCESS_ENABLED', ''],
      ['OPERATOR_ACCESS_ISSUER', 'http://synthetic-qmenux.cloudflareaccess.com'],
      ['OPERATOR_ACCESS_ISSUER', `${issuer}/`], ['OPERATOR_ACCESS_ISSUER', `${issuer}:443`],
      ['OPERATOR_ACCESS_ISSUER', `${issuer}.evil.invalid`],
      ['OPERATOR_ACCESS_ISSUER', 'https://user@synthetic-qmenux.cloudflareaccess.com'],
      ['OPERATOR_ACCESS_ISSUER', 'https://localhost'],
      ['OPERATOR_ACCESS_AUDIENCE', 'tenant-google-client'], ['OPERATOR_ACCESS_AUDIENCE', ''],
      ['NODE_TLS_REJECT_UNAUTHORIZED', '0'],
    ]) {
      configure(); process.env[name!] = value;
      await assert.rejects(access.verify(token()), ServiceUnavailableException);
    }
    assert.equal(requests, 0, 'Invalid or disabled configuration must never fetch keys');
    configure();
    for (const invalid of [undefined, null, [], [token()], '', 'opaque-tenant-session', `Bearer ${token()}`,
      `${token()},${token()}`, 'a'.repeat(8193)]) await assert.rejects(access.verify(invalid), UnauthorizedException);
    assert.equal(requests, 0);
    const identity = await access.verify(token({ email: 'ignored@example.invalid', role: 'SUPERADMIN', amr: ['mfa'] }));
    assert.deepEqual(identity, { issuer, subject: 'synthetic-operator' });
    assert(Object.isFrozen(identity));
    assert.equal(requests, 1);
    await Promise.all(Array.from({ length: 20 }, () => access.verify(token())));
    assert.equal(requests, 1, 'Public key cache is reused, identity is always revalidated');
    const invalidClaims: Record<string, unknown>[] = [
      { iss: 'https://accounts.google.com' }, { aud: ['b'.repeat(64)] }, { aud: audience },
      { aud: [audience, 'b'.repeat(64)] }, { aud: undefined }, { exp: now - 1 }, { exp: undefined },
      { exp: 'later' }, { iat: now + 60 }, { iat: now - 901 }, { iat: undefined },
      { nbf: now + 60 }, { nbf: undefined }, { sub: '' }, { sub: ' ' }, { sub: undefined },
      { sub: 'x'.repeat(256) }, { type: 'org' }, { type: undefined }, { common_name: 'service.access' },
      { service_token_id: 'machine' },
    ];
    for (const changes of invalidClaims) await assert.rejects(access.verify(token(changes)), UnauthorizedException);
    await assert.rejects(access.verify(token({}, {}, attacker.privateKey)), UnauthorizedException);
    for (const header of [{ alg: 'HS256' }, { alg: 'none' }, { typ: 'other' }, { kid: 'unknown' },
      { jku: 'https://attacker.invalid/jwks', kid: 'attacker' }]) {
      await assert.rejects(access.verify(token({}, header)), UnauthorizedException);
    }
    assert.equal(requests, 1, 'Untrusted key hints cannot trigger alternate URL fetches or bypass cooldown');

    t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
    mode = 'rotate'; t.mock.timers.tick(31000);
    assert.deepEqual(await access.verify(token({}, { kid: 'second' }, rotated.privateKey)), identity);
    assert.equal(requests, 2, 'Unknown key after cooldown refreshes pinned JWKS');
    mode = 'redirect'; t.mock.timers.tick(601000);
    await assert.rejects(access.verify(token({}, { kid: 'second' }, rotated.privateKey)), UnauthorizedException);
    mode = 'broken';
    await assert.rejects(new OperatorAccess().verify(token()), UnauthorizedException);
    t.mock.timers.reset();

    mode = 'normal';
    process.env.OPERATOR_ACCESS_AUDIENCE = 'b'.repeat(64);
    await assert.rejects(access.verify(token()), UnauthorizedException);
    configure();
    process.env.OPERATOR_ACCESS_ISSUER = 'https://different-team.cloudflareaccess.com';
    await assert.rejects(access.verify(token()), UnauthorizedException);
    configure(); mode = 'timeout';
    const started = performance.now();
    await assert.rejects(new OperatorAccess().verify(token()), UnauthorizedException);
    assert(performance.now() - started < 6500, 'JWKS lookup must abort at five seconds');
  } finally {
    t.mock.timers.reset();
    globalThis.fetch = originalFetch;
    for (const name of Object.keys(process.env)) if (!(name in env)) delete process.env[name];
    Object.assign(process.env, env);
  }
});
