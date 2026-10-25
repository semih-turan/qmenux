import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ServiceUnavailableException } from '@nestjs/common';
import { exportPKCS8, exportSPKI, generateKeyPair, jwtVerify } from 'jose';
import { AppleClientSecret } from '../src/apple-client-secret.js';

test('Apple client secret is short-lived ES256, server-configured, rotatable and fail-closed', async () => {
  const saved = { ...process.env }, originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error('No network allowed'); };
  const keys = await generateKeyPair('ES256', { extractable: true });
  const next = await generateKeyPair('ES256', { extractable: true });
  const wrong = await generateKeyPair('ES384', { extractable: true });
  const pem = await exportPKCS8(keys.privateKey);
  const variables = ['AUTH_APPLE_ENABLED','APPLE_TEAM_ID','APPLE_KEY_ID','APPLE_CLIENT_ID','APPLE_PRIVATE_KEY'];
  const service = new AppleClientSecret();
  const unavailable = (e: unknown) => {
    assert(e instanceof ServiceUnavailableException);
    assert.deepEqual(e.getResponse(), { status: 'unavailable' }); return true;
  };
  try {
    for (const name of variables) delete process.env[name];
    await assert.rejects(service.create(), unavailable);
    process.env.AUTH_APPLE_ENABLED = 'true';
    process.env.APPLE_TEAM_ID = 'TEAM123456';
    process.env.APPLE_KEY_ID = 'KEY1234567';
    process.env.APPLE_CLIENT_ID = 'com.example.synthetic.web';
    process.env.APPLE_PRIVATE_KEY = pem;
    const before = Math.floor(Date.now() / 1000);
    const token = await service.create();
    const { payload, protectedHeader } = await jwtVerify(token, keys.publicKey, {
      algorithms: ['ES256'], issuer: 'TEAM123456', audience: 'https://appleid.apple.com', subject: 'com.example.synthetic.web',
    });
    assert.deepEqual(protectedHeader, { alg: 'ES256', kid: 'KEY1234567' });
    assert(payload.iat! >= before && payload.iat! <= Math.floor(Date.now() / 1000));
    assert.equal(payload.exp! - payload.iat!, 300);
    assert.deepEqual(Object.keys(payload).sort(), ['aud','exp','iat','iss','sub']);
    await assert.rejects(jwtVerify(token, keys.publicKey, { currentDate: new Date(payload.exp! * 1000) }));
    await assert.rejects(jwtVerify(token, next.publicKey));
    for (const name of variables) {
      const value = process.env[name]; delete process.env[name];
      await assert.rejects(service.create(), unavailable); process.env[name] = value;
    }
    for (const [name, value] of [
      ['AUTH_APPLE_ENABLED', 'false'], ['AUTH_APPLE_ENABLED', 'TRUE'], ['APPLE_TEAM_ID', 'short'],
      ['APPLE_TEAM_ID', 'team123456'], ['APPLE_KEY_ID', 'KEY1234567 '], ['APPLE_CLIENT_ID', 'bad client'],
      ['APPLE_CLIENT_ID', 'https://evil.invalid'], ['APPLE_CLIENT_ID', 'x'.repeat(256)],
      ['APPLE_PRIVATE_KEY', 'private provider diagnostic'], ['APPLE_PRIVATE_KEY', 'x'.repeat(16385)],
      ['APPLE_PRIVATE_KEY', await exportSPKI(keys.publicKey)], ['APPLE_PRIVATE_KEY', await exportPKCS8(wrong.privateKey)],
    ]) {
      const old = process.env[name!]; process.env[name!] = value;
      await assert.rejects(service.create(), unavailable); process.env[name!] = old;
    }
    process.env.APPLE_KEY_ID = 'NEW1234567';
    process.env.APPLE_PRIVATE_KEY = await exportPKCS8(next.privateKey);
    const rotated = await service.create();
    assert.equal((await jwtVerify(rotated, next.publicKey, { algorithms: ['ES256'] })).protectedHeader.kid, 'NEW1234567');
    await assert.rejects(jwtVerify(rotated, keys.publicKey));
    process.env.AUTH_APPLE_ENABLED = 'false';
    await assert.rejects(service.create(), unavailable);
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of variables) {
      if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name];
    }
  }
});
