import { describe, expect, it } from 'vitest';
import { computeIncrementalSerpCap } from '../src/incrementalCoverage.js';

describe('computeIncrementalSerpCap', () => {
  it('expands incremental scans to at least the scan cap', () => {
    expect(computeIncrementalSerpCap({ incrementalMode: true, maxResults: 10, scanCap: 600 })).toBe(600);
    expect(computeIncrementalSerpCap({ incrementalMode: true, maxResults: 800, scanCap: 600 })).toBe(800);
  });

  it('uses maxResults directly for non-incremental runs', () => {
    expect(computeIncrementalSerpCap({ incrementalMode: false, maxResults: 25, scanCap: 600 })).toBe(25);
  });
});
