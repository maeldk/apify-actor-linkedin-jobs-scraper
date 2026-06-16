import { describe, expect, it } from 'vitest';
import { shouldFailAllSearchTargets } from '../src/failureIsolation.js';

describe('shouldFailAllSearchTargets', () => {
  it('fails when every search target failed before collecting jobs', () => {
    expect(shouldFailAllSearchTargets({
      targetCount: 2,
      failedTargets: 2,
      collectedCount: 0,
    })).toBe(true);
  });

  it('does not fail legitimate empty searches', () => {
    expect(shouldFailAllSearchTargets({
      targetCount: 1,
      failedTargets: 0,
      collectedCount: 0,
    })).toBe(false);
  });

  it('does not fail partial target failures when data was collected', () => {
    expect(shouldFailAllSearchTargets({
      targetCount: 3,
      failedTargets: 2,
      collectedCount: 7,
    })).toBe(false);
  });
});
