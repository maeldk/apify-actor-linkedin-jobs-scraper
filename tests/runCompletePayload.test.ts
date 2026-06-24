import { describe, expect, it } from 'vitest';
import { buildSuccessRunCompletePayload } from '../src/runCompletePayload.js';

describe('buildSuccessRunCompletePayload', () => {
  it('adds a zero-result reason when nothing was emitted or skipped', () => {
    expect(buildSuccessRunCompletePayload(0, 0, 123)).toEqual({
      emitted: 0,
      unchangedSkipped: 0,
      totalReviews: 0,
      status: 'success',
      ok: true,
      durationMs: 123,
      reason: 'no_results',
    });
  });

  it('omits the zero-result reason when the run produced or skipped known items', () => {
    expect(buildSuccessRunCompletePayload(2, 0, 123)).not.toHaveProperty('reason');
    expect(buildSuccessRunCompletePayload(0, 3, 123)).not.toHaveProperty('reason');
  });
});
