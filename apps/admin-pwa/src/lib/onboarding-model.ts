export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type Application = {
  id: string; requestedName: string; status: 'DRAFT' | 'PENDING_APPROVAL'; revision: number;
  createdAt: string; submittedAt: string | null;
};

function timestamp(value: unknown): string {
  if (typeof value !== 'string' || value.length !== 24 || new Date(value).toISOString() !== value) throw new Error('Invalid application');
  return value;
}

export function parseApplication(value: unknown): Application {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid application');
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || !uuidPattern.test(row.id)
    || typeof row.requestedName !== 'string' || !row.requestedName.trim() || row.requestedName.length > 200
    || /[\x00-\x1f\x7f]/.test(row.requestedName)
    || !['DRAFT', 'PENDING_APPROVAL'].includes(String(row.status))
    || !Number.isInteger(row.revision) || (row.revision as number) < 1 || (row.revision as number) > 2147483647
    || (row.status === 'DRAFT' && row.submittedAt !== null)) throw new Error('Invalid application');
  return { id: row.id.toLowerCase(), requestedName: row.requestedName, status: row.status as Application['status'],
    revision: row.revision as number, createdAt: timestamp(row.createdAt),
    submittedAt: row.status === 'DRAFT' ? null : timestamp(row.submittedAt) };
}
