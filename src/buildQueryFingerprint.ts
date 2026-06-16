import { createHash } from 'node:crypto';

export type QueryFingerprintInput = Record<string, unknown>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value ?? null;
}

export function buildQueryFingerprint(input: QueryFingerprintInput, fields: string[]): string {
  const payload = fields.map(field => [field, canonicalize(input[field])]);
  return createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex');
}
