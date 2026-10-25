import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { MicrosoftOidc, microsoftEnabled, microsoftIssuer, microsoftTenant } from '../src/microsoft-oidc.js';

test('Microsoft personal-account adapter verifies code flow without exposing provider claims or enabling login', async () => {
  const saved = { ...process.env }, originalFetch = globalThis.fetch;
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const attacker = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...keys.publicKey.export({ format: 'jwk' }), kid: 'synthetic', use: 'sig', alg: 'RS256' };
  const origin = 'https://api.qmenux.com';
  const callback = `${origin}/v1/auth/microsoft/callback`;
  const authority = `https://login.microsoftonline.com/${microsoftTenant}`;
  let requests = 0, exchanges = 0, unavailable = false;
  let claims: Record<string, unknown> = {}, badSignature = false, missingToken = false;
  let expected: { nonce: string; verifier: string };
  globalThis.fetch = async (input, init) => {
    requests++;
    const url = input instanceof Request ? input.url : String(input);
    if (unavailable) throw new Error('Private provider diagnostic');
    if (url === `${microsoftIssuer}/.well-known/openid-configuration`) {
      return Response.json({ issuer: microsoftIssuer, authorization_endpoint: `${authority}/oauth2/v2.0/authorize`,
        token_endpoint: `${authority}/oauth2/v2.0/token`, jwks_uri: `${authority}/discovery/v2.0/keys`,
        token_endpoint_auth_methods_supported: ['client_secret_post'], response_types_supported: ['code'],
        subject_types_supported: ['pairwise'], id_token_signing_alg_values_supported: ['RS256'] });
    }
    if (url === `${authority}/discovery/v2.0/keys`) return Response.json({ keys: [jwk] });
    assert.equal(url, `${authority}/oauth2/v2.0/token`, 'No real provider requests in tests');
    exchanges++;
    const body = new URLSearchParams(String(init?.body));
    assert.equal(body.get('grant_type'), 'authorization_code');
    assert.equal(body.get('redirect_uri'), callback);
    assert.equal(body.get('client_id'), 'synthetic-client');
    assert.equal(body.get('client_secret'), 'synthetic-secret');
    assert.equal(body.get('code_verifier'), expected.verifier);
    const now = Math.floor(Date.now() / 1000);
    const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
    const unsigned = `${encode({ alg: 'RS256', kid: 'synthetic' })}.${encode({ iss: microsoftIssuer,
      tid: microsoftTenant, ver: '2.0', sub: 'synthetic-personal-subject', aud: 'synthetic-client',
      iat: now, exp: now + 60, nonce: expected.nonce, email: 'untrusted@example.invalid', roles: ['PLATFORM_ADMIN'], ...claims })}`;
    const token = `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), badSignature ? attacker.privateKey : keys.privateKey).toString('base64url')}`;
    return Response.json({ token_type: 'Bearer', access_token: 'synthetic-access-token',
      ...(missingToken ? {} : { id_token: token }) });
  };
  try {
    process.env.AUTH_MICROSOFT_ENABLED = 'false';
    process.env.AUTH_BASE_URL = origin;
    process.env.MICROSOFT_CLIENT_ID = 'synthetic-client';
    process.env.MICROSOFT_CLIENT_SECRET = 'synthetic-secret';
    const adapter = new MicrosoftOidc();
    assert.equal(microsoftEnabled(), false);
    await assert.rejects(adapter.start(), ServiceUnavailableException);
    assert.equal(requests, 0);
    process.env.AUTH_MICROSOFT_ENABLED = 'true';
    for (const invalid of ['https://evil.invalid', 'https://admin.qmenux.com', `${origin}/`, 'http://api.qmenux.com']) {
      process.env.AUTH_BASE_URL = invalid;
      await assert.rejects(adapter.start(), ServiceUnavailableException);
    }
    process.env.AUTH_BASE_URL = origin;
    for (const name of ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET']) {
      const value = process.env[name]; process.env[name] = ' ';
      await assert.rejects(adapter.start(), ServiceUnavailableException);
      process.env[name] = value;
    }
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    await assert.rejects(adapter.start(), ServiceUnavailableException);
    if (saved.NODE_TLS_REJECT_UNAUTHORIZED === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = saved.NODE_TLS_REJECT_UNAUTHORIZED;
    assert.equal(requests, 0);
    const attempt = await adapter.start();
    expected = attempt;
    const url = new URL(attempt.url);
    assert.equal(url.origin, 'https://login.microsoftonline.com');
    assert.equal(url.pathname, `/${microsoftTenant}/oauth2/v2.0/authorize`);
    assert.equal(url.searchParams.get('response_type'), 'code');
    assert.equal(url.searchParams.get('scope'), 'openid');
    assert.equal(url.searchParams.get('redirect_uri'), callback);
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.get('code_challenge'), createHash('sha256').update(attempt.verifier).digest('base64url'));
    assert.equal(url.searchParams.get('state'), attempt.state);
    assert.equal(url.searchParams.get('nonce'), attempt.nonce);
    const response = new URL(`${callback}?code=synthetic&state=${attempt.state}`);
    assert.equal(await adapter.finish(response, attempt, attempt.state), 'synthetic-personal-subject');
    const before = exchanges;
    for (const invalid of [new URL(`https://evil.invalid${response.pathname}${response.search}`),
      new URL(`${response.href}#fragment`), new URL(`${origin}/v1/auth/google/callback${response.search}`),
      new URL(`${callback}?error=access_denied&state=${attempt.state}`),
      new URL(`${response.href}&state=duplicate`), new URL(`${callback}?code=x&state=wrong`)]) {
      await assert.rejects(adapter.finish(invalid, attempt, attempt.state), UnauthorizedException);
    }
    assert.equal(exchanges, before);
    for (claims of [{ iss: 'https://evil.invalid' }, { tid: 'other-tenant' }, { ver: '1.0' },
      { aud: 'other-client' }, { exp: 1 }, { nonce: 'wrong' }, { sub: '' }, { sub: ' ' }, { sub: 's'.repeat(256) }]) {
      await assert.rejects(adapter.finish(response, attempt, attempt.state), UnauthorizedException);
    }
    claims = {}; badSignature = true;
    await assert.rejects(adapter.finish(response, attempt, attempt.state), UnauthorizedException);
    badSignature = false; missingToken = true;
    await assert.rejects(adapter.finish(response, attempt, attempt.state), UnauthorizedException);
    missingToken = false; unavailable = true;
    await assert.rejects(new MicrosoftOidc().start(), (e: unknown) => {
      assert(e instanceof ServiceUnavailableException);
      assert.deepEqual(e.getResponse(), { status: 'unavailable' }); return true;
    });
    unavailable = false;
    const retry = new MicrosoftOidc();
    unavailable = true; await assert.rejects(retry.start(), ServiceUnavailableException);
    unavailable = false; await retry.start();
    process.env.AUTH_MICROSOFT_ENABLED = 'false';
    const lastRequests = requests;
    await assert.rejects(adapter.finish(response, attempt, attempt.state), ServiceUnavailableException);
    assert.equal(requests, lastRequests);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of ['AUTH_BASE_URL','AUTH_MICROSOFT_ENABLED','MICROSOFT_CLIENT_ID','MICROSOFT_CLIENT_SECRET','NODE_TLS_REJECT_UNAUTHORIZED']) {
      if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name];
    }
  }
});
