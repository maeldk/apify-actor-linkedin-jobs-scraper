export function shouldFailAllSearchTargets(params: {
  targetCount: number;
  failedTargets: number;
  collectedCount: number;
}): boolean {
  return params.targetCount > 0
    && params.collectedCount === 0
    && params.failedTargets >= params.targetCount;
}
