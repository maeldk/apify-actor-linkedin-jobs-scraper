/**
 * Contract (pre-push GATE 47): no resolvable target → controlled no-op success,
 * never Actor.fail(). linkedin-jobs needs keywords (incl. searchString/query/… aliases),
 * geoIds, regions, regionPresets, location, or startUrls (LinkedIn job-search URLs).
 * The remaining fields are filters that narrow a search and target nothing on their own.
 *
 * Imported from inputNormalize.ts (not main.ts) — main.ts is a top-level-await script.
 * Runtime exit standardised by noActionableExit.ts.
 */
import { describe, it, expect } from 'vitest';
import { normalizeInput, hasActionableTarget } from '../src/inputNormalize.js';

const actionable = (raw: Record<string, unknown>) => hasActionableTarget(normalizeInput(raw as never));

describe('no-actionable-input contract', () => {
  it('empty input → not actionable', () => { expect(actionable({})).toBe(false); });
  it('foreign/unknown fields only → not actionable', () => { expect(actionable({ foo: 'bar', mode: 'reviews' })).toBe(false); });
  it('filter-only (jobType/easyApply, no source) → not actionable', () => {
    expect(actionable({ jobType: ['full-time'], easyApply: true })).toBe(false);
  });
  it('{searchString} → recovered keywords (actionable)', () => {
    const norm = normalizeInput({ searchString: 'data engineer' } as never);
    expect(norm.keywords).toBe('data engineer');
    expect(hasActionableTarget(norm)).toBe(true);
  });
  it('keywords / location / geoIds / regions are actionable', () => {
    expect(actionable({ keywords: 'nurse' })).toBe(true);
    expect(actionable({ location: 'Berlin' })).toBe(true);
    expect(actionable({ geoIds: ['101282230'] })).toBe(true);
    expect(actionable({ regions: ['DE'] })).toBe(true);
  });
  it('startUrls are actionable', () => {
    expect(actionable({ startUrls: [{ url: 'https://www.linkedin.com/jobs/search/?keywords=engineer' }] })).toBe(true);
  });
});
