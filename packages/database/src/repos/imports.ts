import type { Tx } from '../db.js';
import { audit } from './audit.js';
import { createCategory, createProduct, listCategories, listProducts, updateProduct, NotFoundError, ConflictError, type Actor } from './catalog.js';

/**
 * Staged CSV/XLSX imports (T027). A batch holds the parsed grid and the current mapping; applying it
 * creates missing categories and creates/updates products as DRAFT changes. Nothing is published:
 * the owner reviews the draft and publishes through the normal flow. Everything runs under tenant RLS.
 */

export type ImportStatus = 'VALIDATED' | 'APPLIED' | 'DISCARDED';
export type DuplicatePolicy = 'update' | 'skip';

export interface StoredRow {
  line: number;
  category: string;
  name: string;
  description: string | null;
  priceMinor: number | null;
  tags: string[];
  errors: string[];
}

export interface ImportBatchRow {
  id: string;
  filename: string;
  status: ImportStatus;
  summary: Record<string, unknown>;
  rows: { headers: string[]; grid: string[][]; mapping: Record<string, number>; results: StoredRow[] };
  createdAt: string;
  appliedAt: string | null;
}

function map(r: Record<string, unknown>): ImportBatchRow {
  return {
    id: r.id as string,
    filename: r.filename as string,
    status: r.status as ImportStatus,
    summary: (r.summary ?? {}) as Record<string, unknown>,
    rows: (r.rows ?? { headers: [], grid: [], mapping: {}, results: [] }) as ImportBatchRow['rows'],
    createdAt: (r.created_at as Date).toISOString(),
    appliedAt: r.applied_at ? (r.applied_at as Date).toISOString() : null,
  };
}

export async function createBatch(tx: Tx, actor: Actor, input: { filename: string; rows: ImportBatchRow['rows']; summary: Record<string, unknown> }): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO qx.import_batches (tenant_id, branch_id, filename, summary, rows, created_by)
     VALUES ($1, (SELECT id FROM qx.branches WHERE is_primary LIMIT 1), $2, $3, $4, $5) RETURNING id`,
    [actor.tenantId, input.filename, JSON.stringify(input.summary), JSON.stringify(input.rows), actor.userId],
  );
  return rows[0]!.id;
}

export async function getBatch(tx: Tx, id: string): Promise<ImportBatchRow> {
  const { rows } = await tx.query('SELECT * FROM qx.import_batches WHERE id = $1', [id]);
  if (!rows[0]) throw new NotFoundError('import');
  return map(rows[0]);
}

export async function listBatches(tx: Tx): Promise<Omit<ImportBatchRow, 'rows'>[]> {
  const { rows } = await tx.query('SELECT id, filename, status, summary, created_at, applied_at FROM qx.import_batches ORDER BY created_at DESC LIMIT 10');
  return rows.map((r) => {
    const { rows: _rows, ...rest } = map({ ...r, rows: null });
    return rest;
  });
}

export async function updateBatchRows(tx: Tx, id: string, rows: ImportBatchRow['rows'], summary: Record<string, unknown>): Promise<void> {
  const { rowCount } = await tx.query(`UPDATE qx.import_batches SET rows = $2, summary = $3 WHERE id = $1 AND status = 'VALIDATED'`, [id, JSON.stringify(rows), JSON.stringify(summary)]);
  if (!rowCount) throw new ConflictError('batch is not editable');
}

export async function discardBatch(tx: Tx, actor: Actor, id: string): Promise<void> {
  const { rowCount } = await tx.query(`UPDATE qx.import_batches SET status = 'DISCARDED' WHERE id = $1 AND status = 'VALIDATED'`, [id]);
  if (!rowCount) throw new NotFoundError('import');
  await audit(tx, { tenantId: actor.tenantId, actorUserId: actor.userId, actorKind: 'member', action: 'import.discard', targetType: 'import_batch', targetId: id });
}

const key = (s: string) =>
  s
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ');

export interface ApplyResult {
  createdCategories: number;
  createdProducts: number;
  updatedProducts: number;
  skipped: number;
  invalid: number;
}

/**
 * Draft commit. Rows with errors are skipped (never partially written); categories are matched
 * case-insensitively by name; an existing product with the same name in the same category is
 * updated or skipped according to the policy. Runs in one transaction with the caller.
 */
export async function applyBatch(tx: Tx, actor: Actor, id: string, policy: DuplicatePolicy): Promise<ApplyResult> {
  const batch = await getBatch(tx, id);
  if (batch.status !== 'VALIDATED') throw new ConflictError('batch already applied or discarded');
  const categories = new Map((await listCategories(tx)).map((c) => [key(c.name), c.id]));
  const products = await listProducts(tx);
  const byKey = new Map(products.map((p) => [`${p.categoryId}::${key(p.name)}`, p]));
  const out: ApplyResult = { createdCategories: 0, createdProducts: 0, updatedProducts: 0, skipped: 0, invalid: 0 };

  for (const r of batch.rows.results) {
    if (r.errors.length > 0 || r.priceMinor === null) {
      out.invalid++;
      continue;
    }
    let categoryId = categories.get(key(r.category));
    if (!categoryId) {
      categoryId = await createCategory(tx, actor, { name: r.category, description: null, isVisible: true });
      categories.set(key(r.category), categoryId);
      out.createdCategories++;
    }
    const existing = byKey.get(`${categoryId}::${key(r.name)}`);
    if (existing) {
      if (policy === 'skip') {
        out.skipped++;
        continue;
      }
      const version = await updateProduct(tx, actor, existing.id, { priceMinor: r.priceMinor, description: r.description, tags: r.tags, expectedVersion: existing.version });
      byKey.set(`${categoryId}::${key(r.name)}`, { ...existing, version, priceMinor: r.priceMinor });
      out.updatedProducts++;
    } else {
      const pid = await createProduct(tx, actor, { categoryId, name: r.name, description: r.description, priceMinor: r.priceMinor, tags: r.tags, allergens: [], calories: null });
      byKey.set(`${categoryId}::${key(r.name)}`, { ...products[0]!, id: pid, categoryId, name: r.name, version: 1, priceMinor: r.priceMinor, description: r.description, tags: r.tags });
      out.createdProducts++;
    }
  }

  await tx.query(`UPDATE qx.import_batches SET status = 'APPLIED', applied_at = now(), summary = summary || $2::jsonb WHERE id = $1`, [id, JSON.stringify({ applied: out, policy })]);
  await audit(tx, { tenantId: actor.tenantId, actorUserId: actor.userId, actorKind: 'member', action: 'import.apply', targetType: 'import_batch', targetId: id, metadata: { ...out, policy, filename: batch.filename } });
  return out;
}
