import { describe, expect, it } from 'vitest';
import { buildCoverageProofFromSerp } from '../src/SerpResult.js';
import { COMPLETE_COVERAGE, buildIncompleteCoverage } from '../src/incrementalState.js';

describe('buildCoverageProofFromSerp()', () => {
  it('preserves incomplete prior coverage', () => {
    const prior = buildIncompleteCoverage('no_prior_state');
    expect(buildCoverageProofFromSerp(prior, {
      hitMaxResultsCap: false,
      hitPageCap: false,
      failedPages: 0,
      fallbackDegraded: false,
      paginationMetaOk: true,
    })).toBe(prior);
  });

  it('maps result-list failures to incomplete coverage reasons', () => {
    expect(buildCoverageProofFromSerp(COMPLETE_COVERAGE, {
      hitMaxResultsCap: true,
      hitPageCap: false,
      failedPages: 0,
      fallbackDegraded: false,
      paginationMetaOk: true,
    })).toEqual({ complete: false, reason: 'max_results_cap' });
  });

  it('returns complete coverage when all signals are clean', () => {
    expect(buildCoverageProofFromSerp(COMPLETE_COVERAGE, {
      hitMaxResultsCap: false,
      hitPageCap: false,
      failedPages: 0,
      fallbackDegraded: false,
      paginationMetaOk: true,
    })).toEqual({ complete: true });
  });
});
