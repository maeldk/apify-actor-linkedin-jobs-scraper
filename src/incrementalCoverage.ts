export interface SerpCapArgs {
  incrementalMode: boolean;
  maxResults: number;
  scanCap: number;
}

export function computeIncrementalSerpCap(args: SerpCapArgs): number {
  const { incrementalMode, maxResults, scanCap } = args;
  if (incrementalMode) {
    return maxResults > 0 ? Math.max(maxResults, scanCap) : scanCap;
  }
  return maxResults > 0 ? maxResults : Number.POSITIVE_INFINITY;
}
