import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFile, lstat, mkdir, mkdtemp, readlink, rm, symlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout } from 'node:timers/promises';
import { nodeFileTrace } from '@vercel/nft';

const base = resolve('.');
const entrypoint = 'apps/api/dist/src/main.js';
const { fileList, warnings } = await nodeFileTrace([entrypoint], { base, processCwd: join(base, 'apps/api') });
const output = await mkdtemp(join(tmpdir(), 'qmenux-t047-trace-'));
let child;
let bytes = 0;
try {
  for (const name of fileList) {
    assert(!isAbsolute(name) && !name.split('/').includes('..'), 'Trace must remain inside repository');
    const source = join(base, name);
    const target = join(output, name);
    await mkdir(dirname(target), { recursive: true });
    const info = await lstat(source);
    if (info.isSymbolicLink()) {
      const link = await readlink(source);
      assert(!isAbsolute(link), 'External absolute symlink is not portable');
      await symlink(link, target);
    } else {
      await copyFile(source, target);
      bytes += info.size;
    }
  }
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const address = reservation.address();
  assert(address && typeof address !== 'string');
  const port = address.port;
  await new Promise((resolveClose) => reservation.close(resolveClose));
  const started = performance.now();
  // Only local runtime inputs are passed; no provider credentials inherited.
  child = spawn(process.execPath, [join(output, entrypoint)], {
    cwd: output,
    env: { PATH: process.env.PATH, PORT: String(port), NODE_ENV: 'production' },
    stdio: 'ignore',
  });
  const readinessDeadline = globalThis.AbortSignal.timeout(5000);
  let response;
  for (let attempt = 0; attempt < 100; attempt++) {
    assert(child.exitCode === null, 'Traced API exited before readiness');
    try {
      response = await globalThis.fetch(`http://127.0.0.1:${port}/v1/health`, { signal: readinessDeadline });
      break;
    } catch (error) {
      if (readinessDeadline.aborted) throw new Error('API readiness deadline exceeded', { cause: error });
      await setTimeout(50);
    }
  }
  assert(response, 'Traced API did not become ready within probe timeout');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { status: 'ok' });
  const startupMs = Math.round(performance.now() - started);
  const replies = await Promise.all(Array.from({ length: 20 }, () => globalThis.fetch(`http://127.0.0.1:${port}/v1/health`, { signal: globalThis.AbortSignal.timeout(5000) })));
  for (const reply of replies) {
    assert.equal(reply.status, 200);
    assert.deepEqual(await reply.json(), { status: 'ok' });
  }
  console.log(JSON.stringify({ result: 'PASS', tracedFiles: fileList.size, fileBytes: bytes, localProcessStartupMs: startupMs, concurrentHealthRequests: replies.length, traceWarnings: [...warnings].map((warning) => warning.message) }, null, 2));
} finally {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await once(child, 'exit');
  }
  await rm(output, { recursive: true, force: true });
}
