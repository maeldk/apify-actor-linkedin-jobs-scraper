import { describe, expect, it } from 'vitest';
import { classifyDeadline, deadlineBufferMs, deadlineDisposition, resolveDeadlineMs } from '../src/diag-stream.js';

describe('diag-stream deadline helpers', () => {
  it('bounds the deadline buffer', () => {
    expect(deadlineBufferMs(60_000)).toBe(20_000);
    expect(deadlineBufferMs(60 * 60_000)).toBe(60_000);
  });

  it('resolves Apify timeout env aliases', () => {
    const deadline = '2026-06-24T18:00:00.000Z';
    const expected = Date.parse(deadline);
    expect(resolveDeadlineMs({ APIFY_TIMEOUT_AT: deadline })).toBe(expected);
    expect(resolveDeadlineMs({ ACTOR_TIMEOUT_AT: deadline })).toBe(expected);
    expect(resolveDeadlineMs({ APIFY_ACTOR_TIMEOUT_AT: deadline })).toBe(expected);
    expect(resolveDeadlineMs({ APIFY_TIMEOUT_AT: 'invalid' })).toBeNull();
    expect(resolveDeadlineMs({})).toBeNull();
  });

  it('classifies wedged and benign deadline dispositions', () => {
    expect(classifyDeadline(10 * 60_000, 120_000).wedged).toBe(true);
    expect(deadlineDisposition(true)).toMatchObject({ exitCode: 1, ok: false });
    expect(deadlineDisposition(false)).toMatchObject({ exitCode: 0, ok: true });
  });
});
