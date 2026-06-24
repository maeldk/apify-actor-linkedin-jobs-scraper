export interface SuccessRunCompletePayload extends Record<string, unknown> {
  emitted: number;
  unchangedSkipped: number;
  totalReviews: number;
  status: 'success';
  ok: true;
  durationMs: number;
  reason?: 'no_results';
}

export function buildSuccessRunCompletePayload(
  emitted: number,
  unchangedSkipped: number,
  durationMs: number,
): SuccessRunCompletePayload {
  const totalReviews = emitted + unchangedSkipped;
  return {
    emitted,
    unchangedSkipped,
    totalReviews,
    status: 'success',
    ok: true,
    durationMs,
    ...(totalReviews === 0 ? { reason: 'no_results' as const } : {}),
  };
}
