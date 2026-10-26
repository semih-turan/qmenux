import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import type { Db, MenuSnapshot } from '@qmenux/database';
import { renderPdf } from './pdf.js';

const PDF_TTL_DAYS = 30;

interface JobRow {
  id: string;
  tenant_id: string;
  branch_id: string;
  revision_no: number;
  export_type: 'MENU_A4' | 'ALLERGEN_A4';
  include_sold_out: boolean;
  status: string;
  tenant_name: string;
  branch_name: string | null;
}

export async function processPdf(db: Pick<Db, 'withWorker'>, mediaDir: string, jobId: string) {
  const job = await db.withWorker(async (tx) => {
    const j = await tx.query<JobRow>(
      `SELECT j.id, j.tenant_id, j.branch_id, j.revision_no, j.export_type, j.include_sold_out, j.status,
              t.display_name AS tenant_name, b.name AS branch_name
         FROM qx.pdf_export_jobs j JOIN qx.tenants t ON t.id = j.tenant_id JOIN qx.branches b ON b.id = j.branch_id
        WHERE j.id = $1`,
      [jobId],
    );
    if (!j.rows[0]) return null;
    if (j.rows[0].status === 'READY') return { ...j.rows[0], revision: null };
    const r = await tx.query<{ snapshot: MenuSnapshot; published_at: Date }>(
      `SELECT snapshot, published_at FROM qx.menu_revisions WHERE tenant_id = $1 AND branch_id = $2 AND revision_no = $3`,
      [j.rows[0].tenant_id, j.rows[0].branch_id, j.rows[0].revision_no],
    );
    await tx.query(`UPDATE qx.pdf_export_jobs SET status = 'RUNNING', error = NULL WHERE id = $1`, [jobId]);
    return { ...j.rows[0], revision: r.rows[0] ?? null };
  });
  if (!job) throw new Error(`pdf job ${jobId} not found`);
  if (job.status === 'READY') return; // idempotent re-delivery
  if (!job.revision) throw new Error(`revision ${job.revision_no} not found for job ${jobId}`);

  try {
    const bytes = await renderPdf({
      exportType: job.export_type,
      includeSoldOut: job.include_sold_out,
      tenantName: job.tenant_name,
      branchName: job.branch_name,
      revisionNo: job.revision_no,
      publishedAt: job.revision.published_at,
      snapshot: job.revision.snapshot,
    });
    const key = `t/${job.tenant_id}/${randomBytes(16).toString('base64url')}.pdf`;
    const file = join(mediaDir, key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, bytes);
    await db.withWorker((tx) =>
      tx.query(`UPDATE qx.pdf_export_jobs SET status = 'READY', file_key = $2, generated_at = now(), expires_at = now() + ($3 || ' days')::interval WHERE id = $1`, [jobId, key, String(PDF_TTL_DAYS)]),
    );
    console.log(`pdf ready job=${jobId} tenant=${job.tenant_id} bytes=${bytes.length}`);
  } catch (err) {
    await db.withWorker((tx) => tx.query(`UPDATE qx.pdf_export_jobs SET status = 'FAILED', error = $2 WHERE id = $1`, [jobId, String((err as Error).message).slice(0, 300)]));
    throw err;
  }
}
