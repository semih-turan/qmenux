import assert from 'node:assert/strict';
import process from 'node:process';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

const run = promisify(execFile);

test('a listening API that never responds reaches the readiness deadline and cleans up', { timeout: 15_000 }, async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'qmenux-trace-timeout-test-'));
  const scratch = join(fixture, 'scratch');
  try {
    await mkdir(join(fixture, 'apps/api/dist/src'), { recursive: true });
    await mkdir(scratch);
    await writeFile(join(fixture, 'apps/api/dist/src/main.js'),
      "require('node:http').createServer(() => {}).listen(Number(process.env.PORT), '127.0.0.1');\n");
    await assert.rejects(run(process.execPath, [resolve('infrastructure/spikes/trace-api.mjs')], {
      cwd: fixture,
      env: { ...process.env, TMPDIR: scratch, TMP: scratch, TEMP: scratch },
      timeout: 10_000,
    }), (error) => {
      assert.equal(error.code, 1, 'probe must fail itself rather than be killed by the test timeout');
      assert.equal(error.killed, false);
      assert.match(error.stderr, /API readiness deadline exceeded/);
      return true;
    });
    assert.deepEqual(await readdir(scratch), [], 'traced output must be removed after timeout');
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
