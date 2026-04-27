import { describe, it, expect } from 'vitest';
import { resolveRegions, ISO2_TO_GEOID } from '../src/regionResolver.js';

describe('resolveRegions', () => {
  it('maps ISO-2 codes to geoIds', () => {
    const r = resolveRegions(['DK', 'SE'], undefined);
    expect(r.geoIds).toContain(ISO2_TO_GEOID.DK);
    expect(r.geoIds).toContain(ISO2_TO_GEOID.SE);
    expect(r.unresolved).toEqual([]);
  });

  it('expands a regionPreset', () => {
    const r = resolveRegions(undefined, 'nordic');
    expect(r.geoIds).toContain(ISO2_TO_GEOID.DK);
    expect(r.geoIds).toContain(ISO2_TO_GEOID.SE);
    expect(r.geoIds).toContain(ISO2_TO_GEOID.NO);
    expect(r.geoIds).toContain(ISO2_TO_GEOID.FI);
    expect(r.geoIds).toContain(ISO2_TO_GEOID.IS);
    expect(r.geoIds).toHaveLength(5);
  });

  it('combines preset + regions', () => {
    const r = resolveRegions(['DE'], 'nordic');
    expect(r.geoIds).toContain(ISO2_TO_GEOID.DE);
    expect(r.geoIds).toContain(ISO2_TO_GEOID.DK);
    expect(r.geoIds).toHaveLength(6);
  });

  it('deduplicates overlapping codes', () => {
    const r = resolveRegions(['DK', 'DK', 'dk'], 'nordic');
    expect(r.geoIds).toHaveLength(5);  // only nordic's 5 codes; DK collapses
  });

  it('reports unresolved ISO-2 codes', () => {
    const r = resolveRegions(['XX', 'DK', 'YY'], undefined);
    expect(r.geoIds).toEqual([ISO2_TO_GEOID.DK]);
    expect(r.unresolved).toEqual(expect.arrayContaining(['XX', 'YY']));
  });

  it('handles lowercase / whitespace input', () => {
    const r = resolveRegions(['  dk  ', 'se'], undefined);
    expect(r.geoIds).toContain(ISO2_TO_GEOID.DK);
    expect(r.geoIds).toContain(ISO2_TO_GEOID.SE);
  });

  it('returns empty when no input', () => {
    expect(resolveRegions(undefined, undefined)).toEqual({ geoIds: [], unresolved: [] });
    expect(resolveRegions([], undefined)).toEqual({ geoIds: [], unresolved: [] });
  });

  it('eu-27 preset expands to exactly 27 country geoIds', () => {
    const r = resolveRegions(undefined, 'eu-27');
    expect(r.geoIds).toHaveLength(27);
    expect(r.unresolved).toEqual([]);
  });

  it('all preset codes resolve (no unresolved fallout)', () => {
    const presets = ['nordic', 'dach', 'benelux', 'uk-ireland', 'eu-27', 'gcc', 'mena', 'asean', 'anglosphere', 'latam', 'nordics-extended'] as const;
    for (const p of presets) {
      const r = resolveRegions(undefined, p);
      expect(r.unresolved, `preset ${p}`).toEqual([]);
      expect(r.geoIds.length, `preset ${p}`).toBeGreaterThan(0);
    }
  });
});
