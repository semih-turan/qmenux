import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Db } from '@qmenux/database';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { processPdf } from '../src/pdf-job.js';

vi.mock('../src/pdf.js', () => ({ renderPdf: vi.fn(async () => Buffer.from('%PDF-test')) }));

const job = {
  id: 'job-1', tenant_id: 'tenant-1', branch_id: 'branch-1', revision_no: 1,
  export_type: 'MENU_A4', include_sold_out: false, status: 'PENDING',
  tenant_name: 'Test Cafe', branch_name: null,
};

function database(query: ReturnType<typeof vi.fn>): Pick<Db, 'withWorker'> {
  return { withWorker: (fn) => fn({ query }) };
}

let dir: string | undefined;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

describe('PDF job delivery', () => {
  it('leaves a completed PDF READY when its event is delivered again', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ ...job, status: 'READY' }] });
    await processPdf(database(query), '/unused', job.id);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]![0]).toContain('SELECT');
  });

  it('writes a pending PDF and records its tenant-scoped file key', async () => {
    dir = await mkdtemp(join(tmpdir(), 'qmenux-pdf-job-'));
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [job] })
      .mockResolvedValueOnce({ rows: [{ snapshot: { schema: 1, categories: [] }, published_at: new Date() }] })
      .mockResolvedValue({ rows: [] });
    await processPdf(database(query), dir, job.id);
    expect(query.mock.calls[2]![0]).toContain("status = 'RUNNING'");
    expect(query.mock.calls[3]![0]).toContain("status = 'READY'");
    const key = query.mock.calls[3]![1][1] as string;
    expect(key).toMatch(/^t\/tenant-1\/[A-Za-z0-9_-]{22}\.pdf$/);
    expect(await readFile(join(dir, key), 'utf8')).toBe('%PDF-test');
  });
});
