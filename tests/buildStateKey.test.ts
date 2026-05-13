import { describe, expect, it } from 'vitest';
import { buildFilterFingerprint, buildStateKey } from '../src/buildStateKey.js';

describe('buildStateKey', () => {
  it('is stable for reordered array dimensions', () => {
    const a = buildFilterFingerprint({ geoIds: ['2', '1'], jobType: ['contract', 'fulltime'] });
    const b = buildFilterFingerprint({ jobType: ['fulltime', 'contract'], geoIds: ['1', '2'] });
    expect(a).toBe(b);
  });

  it('ignores unset dimensions', () => {
    expect(buildFilterFingerprint({ a: null, b: undefined, c: '', d: [] })).toBe('nofilter');
  });

  it('keeps raw keyword and location in fingerprint to avoid sanitized collisions', () => {
    const cpp = buildStateKey({ keyword: 'C++', location: 'US' });
    const csharp = buildStateKey({ keyword: 'C#', location: 'US' });
    expect(cpp).not.toBe(csharp);
    expect(cpp).toMatch(/^incremental_c_us_[a-f0-9]{8}$/);
  });

  it('changes when search dimensions change', () => {
    const base = buildStateKey({ keyword: 'engineer', dimensions: { datePosted: 'last24h' } });
    const changed = buildStateKey({ keyword: 'engineer', dimensions: { datePosted: 'last7d' } });
    expect(base).not.toBe(changed);
  });
});
