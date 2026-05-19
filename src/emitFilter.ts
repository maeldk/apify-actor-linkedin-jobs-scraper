/**
 * emitFilter — strip empty fields from output records before pushData.
 *
 * Base feature: `excludeEmptyFields` input toggle (default false).
 *
 * "Empty" means:
 *   - null
 *   - undefined
 *   - empty string ''
 *   - empty array []
 *   - object whose own enumerable properties are all empty (recursively)
 *
 * Preserved as meaningful:
 *   - false
 *   - 0
 *   - 0n / NaN
 *   - non-empty strings/arrays/objects
 *   - Date / Buffer / non-plain-object instances (left as-is)
 *
 * Recursion: only plain objects (`{}`-literals) are walked. Class instances,
 * Dates, Buffers, Maps, Sets are treated as opaque scalars and kept.
 *
 * Top-level call: returns a shallow-copied record with empty top-level fields
 * removed. Nested plain objects (e.g. `socialProfiles`) are walked: if every
 * child is empty, the parent itself is dropped; otherwise the parent is kept
 * with empty children stripped.
 */

const PLAIN_OBJECT_PROTO = Object.prototype;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === PLAIN_OBJECT_PROTO || proto === null;
}

export function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.length === 0;
  if (Array.isArray(v)) return v.length === 0;
  if (isPlainObject(v)) {
    for (const key of Object.keys(v)) {
      if (!isEmptyValue((v as Record<string, unknown>)[key])) return false;
    }
    return true;
  }
  return false;
}

/**
 * Returns a new record with empty fields removed.
 * Nested plain objects are walked recursively; if all children are empty,
 * the parent is dropped from the output.
 *
 * Non-mutating: input record is not modified.
 */
export function stripEmptyFields<T extends Record<string, unknown>>(item: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(item)) {
    const v = item[key];
    if (v === null || v === undefined) continue;
    if (typeof v === 'string') {
      if (v.length === 0) continue;
      out[key] = v;
      continue;
    }
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      out[key] = v;
      continue;
    }
    if (isPlainObject(v)) {
      const nested = stripEmptyFields(v as Record<string, unknown>);
      if (Object.keys(nested).length === 0) continue;
      out[key] = nested;
      continue;
    }
    out[key] = v;
  }
  return out as Partial<T>;
}

/**
 * Convenience: apply stripEmptyFields conditionally.
 * Returns the original item unchanged when `enabled` is false.
 */
export function maybeStripEmpty<T extends Record<string, unknown>>(
  item: T,
  enabled: boolean,
): T | Partial<T> {
  return enabled ? stripEmptyFields(item) : item;
}
