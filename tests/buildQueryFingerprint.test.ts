import { describe, expect, it } from 'vitest';
import { buildQueryFingerprint } from '../src/buildQueryFingerprint.js';

describe('buildQueryFingerprint()', () => {
  it('is deterministic for object key order', () => {
    const a = buildQueryFingerprint({ filters: { b: 2, a: 1 } }, ['filters']);
    const b = buildQueryFingerprint({ filters: { a: 1, b: 2 } }, ['filters']);
    expect(a).toBe(b);
  });

  it('changes when a selected universe field changes', () => {
    const first = buildQueryFingerprint({ keywords: 'engineer', location: 'Berlin' }, ['keywords', 'location']);
    const second = buildQueryFingerprint({ keywords: 'engineer', location: 'Hamburg' }, ['keywords', 'location']);
    expect(first).not.toBe(second);
  });

  it('ignores fields outside the selected universe', () => {
    const first = buildQueryFingerprint({ keywords: 'engineer', maxResults: 1 }, ['keywords']);
    const second = buildQueryFingerprint({ keywords: 'engineer', maxResults: 100 }, ['keywords']);
    expect(first).toBe(second);
  });
});
