import { createHash } from 'node:crypto';
import {
  publicAllergenStatus,
  type AllergenEntry,
  type Availability,
  type CategoryInput,
  type ItemInput,
  type ItemPatch,
} from '@qmenux/contracts';
import type pg from 'pg';
import type { Tx } from '../db.js';
import { isUniqueViolation } from '../db.js';
import { audit } from './audit.js';

/** Raised for optimistic-concurrency conflicts (stale version / revision). */
export class ConflictError extends Error {
  constructor(
    message: string,
    readonly current?: number,
  ) {
    super(message);
    this.name = 'ConflictError';
  }
}
export class NotFoundError extends Error {
  constructor(message = 'not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export interface Actor {
  tenantId: string;
  userId: string;
}

export async function primaryBranchId(tx: Tx): Promise<string> {
  const { rows } = await tx.query<{ id: string }>('SELECT id FROM qx.branches WHERE is_primary LIMIT 1');
  if (!rows[0]) throw new NotFoundError('primary branch');
  return rows[0].id;
}

// ---------------------------------------------------------------- categories
export interface CategoryRow {
  id: string;
  name: string;
  description: string | null;
  position: number;
  isVisible: boolean;
  itemCount: number;
}

export async function listCategories(tx: Tx): Promise<CategoryRow[]> {
  const { rows } = await tx.query(
    `SELECT c.id, c.name, c.description, c.position, c.is_visible,
            (SELECT count(*)::int FROM qx.products p WHERE p.category_id = c.id AND p.deleted_at IS NULL) AS item_count
       FROM qx.categories c WHERE c.deleted_at IS NULL ORDER BY c.position, c.created_at`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    position: r.position,
    isVisible: r.is_visible,
    itemCount: r.item_count,
  }));
}

export async function createCategory(tx: Tx, actor: Actor, input: CategoryInput): Promise<string> {
  const branchId = await primaryBranchId(tx);
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO qx.categories (tenant_id, branch_id, name, description, is_visible, position)
     VALUES ($1, $2, $3, $4, $5,
       COALESCE((SELECT max(position) + 1 FROM qx.categories WHERE branch_id = $2 AND deleted_at IS NULL), 0))
     RETURNING id`,
    [actor.tenantId, branchId, input.name, input.description ?? null, input.isVisible],
  );
  const id = rows[0]!.id;
  await audit(tx, { tenantId: actor.tenantId, actorUserId: actor.userId, actorKind: 'member', action: 'category.create', targetType: 'category', targetId: id });
  return id;
}

export async function updateCategory(tx: Tx, actor: Actor, id: string, input: Partial<CategoryInput>): Promise<void> {
  const { rowCount } = await tx.query(
    `UPDATE qx.categories SET
       name = COALESCE($2, name),
       description = CASE WHEN $3::boolean THEN $4 ELSE description END,
       is_visible = COALESCE($5, is_visible)
     WHERE id = $1 AND deleted_at IS NULL`,
    [id, input.name ?? null, input.description !== undefined, input.description ?? null, input.isVisible ?? null],
  );
  if (!rowCount) throw new NotFoundError('category');
  await audit(tx, { tenantId: actor.tenantId, actorUserId: actor.userId, actorKind: 'member', action: 'category.update', targetType: 'category', targetId: id });
}

export async function deleteCategory(tx: Tx, actor: Actor, id: string): Promise<void> {
  const { rowCount } = await tx.query('UPDATE qx.categories SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!rowCount) throw new NotFoundError('category');
  await tx.query('UPDATE qx.products SET deleted_at = now() WHERE category_id = $1 AND deleted_at IS NULL', [id]);
  await audit(tx, { tenantId: actor.tenantId, actorUserId: actor.userId, actorKind: 'member', action: 'category.delete', targetType: 'category', targetId: id });
}

/** Ids not belonging to this tenant are simply invisible under RLS and therefore ignored. */
export async function reorder(tx: Tx, table: 'categories' | 'products', ids: string[]): Promise<void> {
  await tx.query(
    `UPDATE qx.${table} AS t SET position = o.ord - 1
       FROM unnest($1::uuid[]) WITH ORDINALITY AS o(id, ord) WHERE t.id = o.id`,
    [ids],
  );
}

// ---------------------------------------------------------------- products
export interface ProductRow {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  priceMinor: number;
  tags: string[];
  position: number;
  availability: Availability;
  version: number;
  imageKey: string | null;
  activeMediaId: string | null;
  calories: { kcal: number; verification: 'UNVERIFIED' | 'VERIFIED'; source: string } | null;
  allergens: (AllergenEntry & { verifiedAt: string | null })[];
  updatedAt: string;
}

const PRODUCT_SELECT = `
  SELECT p.id, p.category_id, p.name, p.description, p.price_minor, p.tags, p.position, p.availability, p.version,
         p.active_media_id, p.updated_at, m.object_key AS image_key,
         n.kcal, n.verification AS kcal_verification, n.source AS kcal_source,
         COALESCE((SELECT jsonb_agg(jsonb_build_object('code', a.allergen_code, 'status', a.status,
                    'verification', a.verification, 'source', a.source, 'verifiedAt', a.verified_at) ORDER BY a.allergen_code)
                   FROM qx.product_allergens a WHERE a.product_id = p.id), '[]'::jsonb) AS allergens
    FROM qx.products p
    LEFT JOIN qx.media_assets m ON m.id = p.active_media_id AND m.deleted_at IS NULL
    LEFT JOIN qx.nutrition_facts n ON n.product_id = p.id`;

function mapProduct(r: pg.QueryResultRow): ProductRow {
  return {
    id: r.id,
    categoryId: r.category_id,
    name: r.name,
    description: r.description,
    priceMinor: Number(r.price_minor),
    tags: r.tags,
    position: r.position,
    availability: r.availability,
    version: r.version,
    imageKey: r.image_key,
    activeMediaId: r.active_media_id,
    calories: r.kcal === null ? null : { kcal: r.kcal, verification: r.kcal_verification, source: r.kcal_source },
    allergens: r.allergens,
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function listProducts(tx: Tx, opts: { categoryId?: string } = {}): Promise<ProductRow[]> {
  const { rows } = await tx.query(
    `${PRODUCT_SELECT} WHERE p.deleted_at IS NULL AND ($1::uuid IS NULL OR p.category_id = $1) ORDER BY p.position, p.created_at`,
    [opts.categoryId ?? null],
  );
  return rows.map(mapProduct);
}

export async function getProduct(tx: Tx, id: string): Promise<ProductRow> {
  const { rows } = await tx.query(`${PRODUCT_SELECT} WHERE p.id = $1 AND p.deleted_at IS NULL`, [id]);
  if (!rows[0]) throw new NotFoundError('product');
  return mapProduct(rows[0]);
}

async function writeAllergens(tx: Tx, actor: Actor, productId: string, entries: AllergenEntry[]) {
  await tx.query('DELETE FROM qx.product_allergens WHERE product_id = $1', [productId]);
  for (const a of entries) {
    // AI suggestions can never be stored as verified in the same write that created them.
    const verified = a.verification === 'VERIFIED' && a.source !== 'AI_SUGGESTION';
    await tx.query(
      `INSERT INTO qx.product_allergens (tenant_id, product_id, allergen_code, status, verification, source, verified_by, verified_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        actor.tenantId,
        productId,
        a.code,
        a.status,
        verified ? 'VERIFIED' : 'UNVERIFIED',
        a.source,
        verified ? actor.userId : null,
        verified ? new Date() : null,
      ],
    );
  }
}

async function writeCalories(tx: Tx, actor: Actor, productId: string, calories: ItemInput['calories']) {
  if (calories === undefined) return;
  if (calories === null) {
    await tx.query('DELETE FROM qx.nutrition_facts WHERE product_id = $1', [productId]);
    return;
  }
  const verified = calories.verification === 'VERIFIED' && calories.source !== 'AI_SUGGESTION';
  await tx.query(
    `INSERT INTO qx.nutrition_facts (tenant_id, product_id, kcal, verification, source, verified_by, verified_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (product_id) DO UPDATE SET kcal = EXCLUDED.kcal, verification = EXCLUDED.verification,
       source = EXCLUDED.source, verified_by = EXCLUDED.verified_by, verified_at = EXCLUDED.verified_at`,
    [actor.tenantId, productId, calories.kcal, verified ? 'VERIFIED' : 'UNVERIFIED', calories.source, verified ? actor.userId : null, verified ? new Date() : null],
  );
}

async function assertCategory(tx: Tx, categoryId: string): Promise<string> {
  const { rows } = await tx.query<{ branch_id: string }>('SELECT branch_id FROM qx.categories WHERE id = $1 AND deleted_at IS NULL', [categoryId]);
  if (!rows[0]) throw new NotFoundError('category');
  return rows[0].branch_id;
}

export async function createProduct(tx: Tx, actor: Actor, input: ItemInput): Promise<string> {
  const branchId = await assertCategory(tx, input.categoryId);
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO qx.products (tenant_id, branch_id, category_id, name, description, price_minor, tags, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7,
       COALESCE((SELECT max(position) + 1 FROM qx.products WHERE category_id = $3 AND deleted_at IS NULL), 0))
     RETURNING id`,
    [actor.tenantId, branchId, input.categoryId, input.name, input.description ?? null, input.priceMinor, input.tags],
  );
  const id = rows[0]!.id;
  await writeAllergens(tx, actor, id, input.allergens);
  await writeCalories(tx, actor, id, input.calories);
  await tx.query('INSERT INTO qx.price_history (tenant_id, product_id, old_price_minor, new_price_minor, changed_by) VALUES ($1, $2, NULL, $3, $4)', [
    actor.tenantId,
    id,
    input.priceMinor,
    actor.userId,
  ]);
  await audit(tx, { tenantId: actor.tenantId, actorUserId: actor.userId, actorKind: 'member', action: 'product.create', targetType: 'product', targetId: id });
  return id;
}

export async function updateProduct(tx: Tx, actor: Actor, id: string, patch: ItemPatch): Promise<number> {
  const cur = await tx.query<{ version: number; price_minor: string }>(
    'SELECT version, price_minor FROM qx.products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
    [id],
  );
  const row = cur.rows[0];
  if (!row) throw new NotFoundError('product');
  if (row.version !== patch.expectedVersion) throw new ConflictError('product was changed by someone else', row.version);
  if (patch.categoryId) await assertCategory(tx, patch.categoryId);
  const { rows } = await tx.query<{ version: number }>(
    `UPDATE qx.products SET
       category_id = COALESCE($2, category_id),
       name = COALESCE($3, name),
       description = CASE WHEN $4::boolean THEN $5 ELSE description END,
       price_minor = COALESCE($6, price_minor),
       tags = COALESCE($7, tags),
       version = version + 1
     WHERE id = $1 RETURNING version`,
    [
      id,
      patch.categoryId ?? null,
      patch.name ?? null,
      patch.description !== undefined,
      patch.description ?? null,
      patch.priceMinor ?? null,
      patch.tags ?? null,
    ],
  );
  if (patch.allergens) await writeAllergens(tx, actor, id, patch.allergens);
  await writeCalories(tx, actor, id, patch.calories);
  if (patch.priceMinor !== undefined && Number(row.price_minor) !== patch.priceMinor) {
    await tx.query('INSERT INTO qx.price_history (tenant_id, product_id, old_price_minor, new_price_minor, changed_by) VALUES ($1, $2, $3, $4, $5)', [
      actor.tenantId,
      id,
      row.price_minor,
      patch.priceMinor,
      actor.userId,
    ]);
  }
  await audit(tx, {
    tenantId: actor.tenantId,
    actorUserId: actor.userId,
    actorKind: 'member',
    action: 'product.update',
    targetType: 'product',
    targetId: id,
    metadata: { fields: Object.keys(patch).filter((k) => k !== 'expectedVersion') },
  });
  return rows[0]!.version;
}

/** Live overlay: applies to the published menu immediately, no republish needed. */
export async function setAvailability(tx: Tx, actor: Actor, id: string, availability: Availability): Promise<void> {
  const { rowCount } = await tx.query(
    `UPDATE qx.products SET availability = $2, availability_changed_at = now(), availability_changed_by = $3
      WHERE id = $1 AND deleted_at IS NULL`,
    [id, availability, actor.userId],
  );
  if (!rowCount) throw new NotFoundError('product');
  await audit(tx, { tenantId: actor.tenantId, actorUserId: actor.userId, actorKind: 'member', action: 'product.availability', targetType: 'product', targetId: id, metadata: { availability } });
}

export async function deleteProduct(tx: Tx, actor: Actor, id: string): Promise<void> {
  const { rowCount } = await tx.query('UPDATE qx.products SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!rowCount) throw new NotFoundError('product');
  await audit(tx, { tenantId: actor.tenantId, actorUserId: actor.userId, actorKind: 'member', action: 'product.delete', targetType: 'product', targetId: id });
}

/** Exactly one active image: replacing it detaches (soft-deletes) the previous asset. */
export async function setActiveMedia(tx: Tx, actor: Actor, productId: string, mediaId: string | null): Promise<string | null> {
  const cur = await tx.query<{ active_media_id: string | null }>('SELECT active_media_id FROM qx.products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [productId]);
  if (!cur.rows[0]) throw new NotFoundError('product');
  const previous = cur.rows[0].active_media_id;
  await tx.query('UPDATE qx.products SET active_media_id = $2 WHERE id = $1', [productId, mediaId]);
  if (previous && previous !== mediaId) await tx.query('UPDATE qx.media_assets SET deleted_at = now() WHERE id = $1', [previous]);
  await audit(tx, { tenantId: actor.tenantId, actorUserId: actor.userId, actorKind: 'member', action: 'product.image', targetType: 'product', targetId: productId });
  return previous;
}

export async function createMediaAsset(
  tx: Tx,
  actor: Actor,
  m: { objectKey: string; contentType: string; bytes: number; width?: number; height?: number },
): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO qx.media_assets (tenant_id, object_key, content_type, bytes, width, height, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [actor.tenantId, m.objectKey, m.contentType, m.bytes, m.width ?? null, m.height ?? null, actor.userId],
  );
  return rows[0]!.id;
}

// ---------------------------------------------------------------- snapshot / publish
export interface SnapshotItem {
  id: string;
  name: string;
  description: string | null;
  priceMinor: number;
  imageKey: string | null;
  tags: string[];
  kcal: number | null;
  allergens: { code: string; status: string }[];
}
export interface SnapshotCategory {
  id: string;
  name: string;
  description: string | null;
  items: SnapshotItem[];
}
export interface MenuSnapshot {
  schema: 1;
  categories: SnapshotCategory[];
}

/** Builds the public-safe snapshot: unverified allergen/kcal claims are downgraded to UNKNOWN/null. */
export async function buildSnapshot(tx: Tx, branchId: string): Promise<MenuSnapshot> {
  const cats = await tx.query(
    `SELECT id, name, description FROM qx.categories
      WHERE branch_id = $1 AND deleted_at IS NULL AND is_visible ORDER BY position, created_at`,
    [branchId],
  );
  const prods = (await listProducts(tx)).filter((p) => cats.rows.some((c) => c.id === p.categoryId));
  return {
    schema: 1,
    categories: cats.rows.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      items: prods
        .filter((p) => p.categoryId === c.id)
        .map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          priceMinor: p.priceMinor,
          imageKey: p.imageKey,
          tags: p.tags,
          kcal: p.calories && p.calories.verification === 'VERIFIED' ? p.calories.kcal : null,
          allergens: p.allergens.map((a) => ({ code: a.code, status: publicAllergenStatus(a) })),
        })),
    })),
  };
}

/** Key-sorted JSON so snapshots compare equal regardless of jsonb key order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export interface PublishState {
  publishedRevisionNo: number;
  latestRevisionNo: number;
}

export async function publishState(tx: Tx, branchId: string): Promise<PublishState> {
  const { rows } = await tx.query<{ published: number | null; latest: number | null }>(
    `SELECT (SELECT revision_no FROM qx.menu_publications WHERE branch_id = $1) AS published,
            (SELECT max(revision_no) FROM qx.menu_revisions WHERE branch_id = $1) AS latest`,
    [branchId],
  );
  return { publishedRevisionNo: rows[0]?.published ?? 0, latestRevisionNo: rows[0]?.latest ?? 0 };
}

async function insertRevision(
  tx: Tx,
  actor: Actor,
  branchId: string,
  expectedRevisionNo: number,
  snapshot: MenuSnapshot,
  extra: { note?: string | null; restoredFromId?: string | null },
): Promise<{ id: string; revisionNo: number }> {
  // Serialise publishers of this branch (transaction-scoped advisory lock).
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [branchId]);
  const state = await publishState(tx, branchId);
  if (state.publishedRevisionNo !== expectedRevisionNo) {
    throw new ConflictError('menu was published by someone else', state.publishedRevisionNo);
  }
  const revisionNo = state.latestRevisionNo + 1;
  const body = canonicalJson(snapshot);
  try {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO qx.menu_revisions (tenant_id, branch_id, revision_no, snapshot, checksum, note, published_by, restored_from_id)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8) RETURNING id`,
      [actor.tenantId, branchId, revisionNo, body, createHash('sha256').update(body).digest('hex'), extra.note ?? null, actor.userId, extra.restoredFromId ?? null],
    );
    const id = rows[0]!.id;
    await tx.query(
      `INSERT INTO qx.menu_publications (tenant_id, branch_id, revision_id, revision_no) VALUES ($1, $2, $3, $4)
       ON CONFLICT (branch_id) DO UPDATE SET revision_id = EXCLUDED.revision_id, revision_no = EXCLUDED.revision_no`,
      [actor.tenantId, branchId, id, revisionNo],
    );
    await tx.query(
      `INSERT INTO qx.outbox_events (tenant_id, type, payload, idempotency_key) VALUES ($1, 'menu.published', $2, $3)`,
      [actor.tenantId, JSON.stringify({ branchId, revisionNo }), `menu.published:${id}`],
    );
    return { id, revisionNo };
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError('concurrent publish');
    throw err;
  }
}

export async function publishMenu(tx: Tx, actor: Actor, opts: { expectedRevisionNo: number; note?: string | null }) {
  const branchId = await primaryBranchId(tx);
  const snapshot = await buildSnapshot(tx, branchId);
  const itemCount = snapshot.categories.reduce((n, c) => n + c.items.length, 0);
  if (itemCount === 0) throw new ConflictError('cannot publish an empty menu');
  const res = await insertRevision(tx, actor, branchId, opts.expectedRevisionNo, snapshot, { note: opts.note });
  await audit(tx, { tenantId: actor.tenantId, actorUserId: actor.userId, actorKind: 'member', action: 'menu.publish', targetType: 'menu_revision', targetId: res.id, metadata: { revisionNo: res.revisionNo, itemCount } });
  return res;
}

/** Rollback never mutates history: it publishes a NEW revision copying an old snapshot. */
export async function restoreRevision(tx: Tx, actor: Actor, revisionId: string, expectedRevisionNo: number) {
  const { rows } = await tx.query<{ branch_id: string; snapshot: MenuSnapshot; revision_no: number }>(
    'SELECT branch_id, snapshot, revision_no FROM qx.menu_revisions WHERE id = $1',
    [revisionId],
  );
  const src = rows[0];
  if (!src) throw new NotFoundError('revision');
  const res = await insertRevision(tx, actor, src.branch_id, expectedRevisionNo, src.snapshot, {
    note: `Geri yükleme: #${src.revision_no}`,
    restoredFromId: revisionId,
  });
  await audit(tx, { tenantId: actor.tenantId, actorUserId: actor.userId, actorKind: 'member', action: 'menu.restore', targetType: 'menu_revision', targetId: res.id, metadata: { from: src.revision_no, revisionNo: res.revisionNo } });
  return res;
}

export interface RevisionRow {
  id: string;
  revisionNo: number;
  note: string | null;
  publishedAt: string;
  publishedBy: string | null;
  restoredFromNo: number | null;
  itemCount: number;
  isCurrent: boolean;
}

export async function listRevisions(tx: Tx, limit = 30): Promise<RevisionRow[]> {
  const { rows } = await tx.query(
    `SELECT r.id, r.revision_no, r.note, r.published_at, u.display_name AS published_by,
            src.revision_no AS restored_from_no,
            (SELECT COALESCE(sum(jsonb_array_length(c->'items')), 0)::int FROM jsonb_array_elements(r.snapshot->'categories') c) AS item_count,
            (pub.revision_id = r.id) AS is_current
       FROM qx.menu_revisions r
       LEFT JOIN qx.menu_revisions src ON src.id = r.restored_from_id
       LEFT JOIN qx.users u ON u.id = r.published_by
       LEFT JOIN qx.menu_publications pub ON pub.branch_id = r.branch_id
      ORDER BY r.revision_no DESC LIMIT $1`,
    [Math.min(limit, 100)],
  );
  return rows.map((r) => ({
    id: r.id,
    revisionNo: r.revision_no,
    note: r.note,
    publishedAt: r.published_at.toISOString(),
    publishedBy: r.published_by,
    restoredFromNo: r.restored_from_no,
    itemCount: r.item_count,
    isCurrent: !!r.is_current,
  }));
}

export async function getRevisionSnapshot(tx: Tx, revisionNo?: number): Promise<{ revisionNo: number; publishedAt: string; snapshot: MenuSnapshot } | null> {
  const { rows } = await tx.query(
    revisionNo === undefined
      ? `SELECT r.revision_no, r.published_at, r.snapshot FROM qx.menu_publications p JOIN qx.menu_revisions r ON r.id = p.revision_id LIMIT 1`
      : `SELECT revision_no, published_at, snapshot FROM qx.menu_revisions WHERE revision_no = $1 LIMIT 1`,
    revisionNo === undefined ? [] : [revisionNo],
  );
  const r = rows[0];
  return r ? { revisionNo: r.revision_no, publishedAt: r.published_at.toISOString(), snapshot: r.snapshot } : null;
}

/** Draft-vs-published diff count for the admin "unpublished changes" banner. */
export async function hasUnpublishedChanges(tx: Tx): Promise<boolean> {
  const branchId = await primaryBranchId(tx);
  const draft = await buildSnapshot(tx, branchId);
  const pub = await getRevisionSnapshot(tx);
  if (!pub) return draft.categories.length > 0;
  return canonicalJson(draft) !== canonicalJson(pub.snapshot);
}
