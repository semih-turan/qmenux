import 'reflect-metadata';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { exportPKCS8, generateKeyPair, jwtVerify } from 'jose';
import { AppleClientSecret } from '../src/apple-client-secret.js';
import { AppleOidc, appleIssuer } from '../src/apple-oidc.js';

test('Apple confidential adapter requires token-endpoint nonce validation and never uses front-channel identity', async () => {
  const saved = { ...process.env }, originalFetch = globalThis.fetch;
  const provider = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const attacker = generateKeyPairSync('rsa', { modulusLength: 2048 });
  let client = await generateKeyPair('ES256', { extractable: true });
  const jwk = { ...provider.publicKey.export({ format: 'jwk' }), kid: 'synthetic-provider', use: 'sig', alg: 'RS256' };
  const callback = 'https://api.qmenux.com/v1/auth/apple/callback';
  let requests = 0, exchanges = 0, sequence = 0, discoveryFailure = false, tokenFailure = false;
  let claims: Record<string, unknown> = {}, metadata: Record<string, unknown> = {};
  let badSignature = false, missingId = false;
  let expectedNonce = '';
  const developerTokens: string[] = [];
  globalThis.fetch = async (input, init) => {
    requests++;
    const url = input instanceof Request ? input.url : String(input);
    if (url === `${appleIssuer}/.well-known/openid-configuration`) {
      assert(!init?.body, 'Discovery must not send developer credentials');
      if (discoveryFailure) throw new Error('Private provider diagnostic');
      return Response.json({ issuer: appleIssuer, authorization_endpoint: `${appleIssuer}/auth/authorize`,
        token_endpoint: `${appleIssuer}/auth/token`, jwks_uri: `${appleIssuer}/auth/keys`,
        response_types_supported: ['code'], response_modes_supported: ['query','form_post'],
        subject_types_supported: ['pairwise'], token_endpoint_auth_methods_supported: ['client_secret_post'],
        id_token_signing_alg_values_supported: ['RS256'], ...metadata });
    }
    if (url === `${appleIssuer}/auth/keys`) return Response.json({ keys: [jwk] });
    assert.equal(url, `${appleIssuer}/auth/token`, 'No real or untrusted provider endpoint in tests');
    exchanges++;
    const body = new URLSearchParams(String(init?.body));
    assert.equal(body.get('grant_type'), 'authorization_code');
    assert.equal(body.get('redirect_uri'), callback);
    assert.equal(body.get('client_id'), 'com.example.synthetic.web');
    assert.equal(body.has('code_verifier'), false, 'Do not pretend PKCE is enforced');
    const developer = body.get('client_secret')!;
    const verified = await jwtVerify(developer, client.publicKey, { algorithms: ['ES256'], issuer: 'TEAM123456',
      audience: appleIssuer, subject: 'com.example.synthetic.web' });
    assert.equal(verified.protectedHeader.kid, process.env.APPLE_KEY_ID);
    assert.equal(verified.payload.exp! - verified.payload.iat!, 300);
    developerTokens.push(developer);
    if (tokenFailure) return Response.json({ error: 'invalid_grant', error_description: 'Private provider diagnostic' }, { status: 400 });
    const now = Math.floor(Date.now() / 1000);
    const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
    const unsigned = `${encode({ alg: 'RS256', kid: 'synthetic-provider' })}.${encode({ iss: appleIssuer,
      sub: 'synthetic-apple-subject', aud: 'com.example.synthetic.web', iat: now, exp: now + 60, nonce: expectedNonce,
      email: 'synthetic@privaterelay.appleid.com', is_private_email: true, roles: ['PLATFORM_ADMIN'], ...claims })}`;
    const token = `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), badSignature ? attacker.privateKey : provider.privateKey).toString('base64url')}`;
    return Response.json({ token_type: 'Bearer', access_token: 'synthetic-access', refresh_token: 'synthetic-refresh',
      ...(missingId ? {} : { id_token: token }) });
  };
  const unavailable = (e: unknown) => {
    assert(e instanceof ServiceUnavailableException); assert.deepEqual(e.getResponse(), { status: 'unavailable' }); return true;
  };
  const denied = (e: unknown) => {
    assert(e instanceof UnauthorizedException); assert(!JSON.stringify(e.getResponse()).includes('Private')); return true;
  };
  try {
    process.env.AUTH_APPLE_ENABLED = 'false';
    process.env.AUTH_BASE_URL = 'https://api.qmenux.com';
    process.env.APPLE_TEAM_ID = 'TEAM123456'; process.env.APPLE_KEY_ID = 'KEY1234567';
    process.env.APPLE_CLIENT_ID = 'com.example.synthetic.web'; process.env.APPLE_PRIVATE_KEY = await exportPKCS8(client.privateKey);
    const adapter = new AppleOidc(new AppleClientSecret());
    await assert.rejects(adapter.start(), unavailable); assert.equal(requests, 0);
    process.env.AUTH_APPLE_ENABLED = 'true';
    process.env.AUTH_BASE_URL = 'https://evil.invalid';
    await assert.rejects(adapter.start(), unavailable); assert.equal(requests, 0);
    process.env.AUTH_BASE_URL = 'https://api.qmenux.com';
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    await assert.rejects(adapter.start(), unavailable); assert.equal(requests, 0);
    if (saved.NODE_TLS_REJECT_UNAUTHORIZED === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = saved.NODE_TLS_REJECT_UNAUTHORIZED;
    const key = process.env.APPLE_PRIVATE_KEY; process.env.APPLE_PRIVATE_KEY = 'invalid';
    await assert.rejects(adapter.start(), unavailable); assert.equal(requests, 0); process.env.APPLE_PRIVATE_KEY = key;
    const attempt = await adapter.start(); expectedNonce = attempt.nonce;
    const url = new URL(attempt.url);
    assert.equal(`${url.origin}${url.pathname}`, `${appleIssuer}/auth/authorize`);
    assert.equal(url.searchParams.get('response_type'), 'code'); assert.equal(url.searchParams.get('response_mode'), 'query');
    assert.equal(url.searchParams.get('redirect_uri'), callback);
    assert.equal(url.searchParams.get('state'), attempt.state); assert.equal(url.searchParams.get('nonce'), attempt.nonce);
    assert.deepEqual(Object.keys(attempt).sort(), ['nonce','state','url']);
    for (const key of ['scope','code_challenge','code_challenge_method','client_secret','id_token']) assert.equal(url.searchParams.has(key), false);
    const response = () => new URL(`${callback}?code=synthetic-${++sequence}&state=${attempt.state}`);
    assert.equal(await adapter.finish(response(), attempt, attempt.state), 'synthetic-apple-subject');
    const before = exchanges;
    for (const invalid of [new URL(`https://evil.invalid/v1/auth/apple/callback?code=x&state=${attempt.state}`),
      new URL(`${callback}?code=x&state=${attempt.state}#fragment`), new URL(`${callback.replace('/apple/', '/google/')}?code=x&state=${attempt.state}`),
      new URL(`${callback}?code=x&state=wrong`), new URL(`${callback}?code=x&state=${attempt.state}&state=duplicate`),
      new URL(`${callback}?error=user_cancelled_authorize&state=${attempt.state}`),
      ...['id_token','access_token','user'].map(p => new URL(`${callback}?code=x&state=${attempt.state}&${p}=untrusted`))]) {
      await assert.rejects(adapter.finish(invalid, attempt, attempt.state), denied);
    }
    await assert.rejects(adapter.finish(response(), { nonce: '' }, attempt.state), denied);
    assert.equal(exchanges, before, 'Malformed/front-channel identity must never reach token exchange');
    for (claims of [{ iss: 'https://evil.invalid' }, { aud: 'other-client' }, { exp: 1 }, { nonce: 'wrong' },
      { nonce: undefined }, { sub: '' }, { sub: ' ' }, { sub: 's'.repeat(256) }]) {
      await assert.rejects(adapter.finish(response(), attempt, attempt.state), denied);
    }
    claims = {}; badSignature = true;
    await assert.rejects(adapter.finish(response(), attempt, attempt.state), denied);
    badSignature = false; missingId = true;
    await assert.rejects(adapter.finish(response(), attempt, attempt.state), denied);
    missingId = false; tokenFailure = true;
    await assert.rejects(adapter.finish(response(), attempt, attempt.state), denied); tokenFailure = false;
    client = await generateKeyPair('ES256', { extractable: true });
    process.env.APPLE_KEY_ID = 'NEW1234567'; process.env.APPLE_PRIVATE_KEY = await exportPKCS8(client.privateKey);
    assert.equal(await adapter.finish(response(), attempt, attempt.state), 'synthetic-apple-subject', 'Key rotation must use a fresh developer JWT');
    assert(developerTokens.length > 1);
    const tokenCount = exchanges;
    for (metadata of [{ issuer: 'https://evil.invalid' }, { authorization_endpoint: 'https://evil.invalid/authorize' },
      { token_endpoint: 'https://evil.invalid/token' }, { jwks_uri: 'https://evil.invalid/keys' },
      { response_modes_supported: ['form_post'] }, { response_types_supported: ['id_token'] },
      { token_endpoint_auth_methods_supported: ['none'] }, { id_token_signing_alg_values_supported: ['ES256'] }]) {
      await assert.rejects(adapter.start(), unavailable);
    }
    assert.equal(exchanges, tokenCount, 'Invalid metadata must never receive credentials');
    metadata = {}; discoveryFailure = true;
    await assert.rejects(adapter.start(), unavailable);
    discoveryFailure = false; await adapter.start();
    process.env.AUTH_APPLE_ENABLED = 'false'; const lastRequests = requests;
    await assert.rejects(adapter.finish(response(), attempt, attempt.state), unavailable); assert.equal(requests, lastRequests);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of ['AUTH_APPLE_ENABLED','AUTH_BASE_URL','APPLE_TEAM_ID','APPLE_KEY_ID','APPLE_CLIENT_ID','APPLE_PRIVATE_KEY','NODE_TLS_REJECT_UNAUTHORIZED']) {
      if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name];
    }
  }
});
