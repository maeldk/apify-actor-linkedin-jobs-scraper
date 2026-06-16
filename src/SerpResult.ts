import type { CoverageIncompleteReason, CoverageProof } from './incrementalState.js';

export interface SerpResult<T> {
  items: T[];
  totalAvailable: number | null;
  hitMaxResultsCap: boolean;
  hitPageCap: boolean;
  failedPages: number;
  fallbackDegraded: boolean;
  paginationMetaOk: boolean;
}

export function buildCoverageProofFromSerp(
  priorCoverage: CoverageProof,
  serp: Pick<SerpResult<unknown>,
    'hitMaxResultsCap' | 'hitPageCap' | 'failedPages' | 'fallbackDegraded' | 'paginationMetaOk'
  >,
): CoverageProof {
  if (!priorCoverage.complete) return priorCoverage;

  let reason: CoverageIncompleteReason | null = null;
  if (serp.hitMaxResultsCap) reason = 'max_results_cap';
  else if (serp.hitPageCap) reason = 'page_cap';
  else if (serp.failedPages > 0) reason = 'failed_pages';
  else if (serp.fallbackDegraded) reason = 'fallback_degraded';
  else if (!serp.paginationMetaOk) reason = 'pagination_metadata_missing';

  return reason ? { complete: false, reason } : { complete: true };
}
