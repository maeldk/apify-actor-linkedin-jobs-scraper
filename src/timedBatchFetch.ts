/**
 * Enhanced parallel batch processor with per-item timing, error classification,
 * retry support, and stability metrics.
 *
 * Designed for free-API actors where concurrency tuning is based on measured
 * API behavior. For Scrape.do actors, use batchFetch.ts instead.
 *
 * Copy strategy: canonical source is _lib/timedBatchFetch.ts.
 * Copy into each actor's src/ directory.
 */

// ── Error classification ─────────────────────────────────────────────

export type FetchErrorClass =
  | 'rate_limit'    // HTTP 429
  | 'server_error'  // HTTP 5xx
  | 'timeout'       // AbortError / signal timeout / ETIMEDOUT
  | 'network'       // ECONNRESET, ECONNREFUSED, fetch TypeError
  | 'parse_fail'    // processFn threw non-HTTP error after fetch succeeded
  | 'other';

/** Classify a thrown error into a FetchErrorClass. */
export function classifyFetchError(error: unknown): FetchErrorClass {
  if (!(error instanceof Error)) return 'other';

  const msg = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  // HTTP status on error object (common pattern: error.status or error.statusCode)
  const status = (error as unknown as Record<string, unknown>).status
    ?? (error as unknown as Record<string, unknown>).statusCode;
  if (typeof status === 'number') {
    if (status === 429) return 'rate_limit';
    if (status >= 500 && status < 600) return 'server_error';
  }

  // Status in message (e.g. "API returned 429" or "HTTP 503")
  if (/\b429\b/.test(msg) || /too many requests/i.test(msg) || /rate.?limit/i.test(msg)) return 'rate_limit';
  if (/\b5\d{2}\b/.test(msg) && /\b(http|api|server|status)\b/i.test(msg)) return 'server_error';

  // Timeout patterns
  if (name === 'aborterror' || name === 'timeouterror') return 'timeout';
  if (/\btimeout\b/i.test(msg) || /etimedout/i.test(msg) || /abort/i.test(msg)) return 'timeout';

  // Network patterns
  if (/econnreset/i.test(msg) || /econnrefused/i.test(msg) || /enotfound/i.test(msg)) return 'network';
  if (/fetch failed/i.test(msg) || /network/i.test(msg) || /socket/i.test(msg)) return 'network';
  if (name === 'typeerror' && /fetch/i.test(msg)) return 'network';

  return 'other';
}

// ── Outcome types ────────────────────────────────────────────────────

export type OutcomeStatus = 'success' | 'empty' | 'error';

export interface ItemOutcome<TOutput> {
  index: number;
  status: OutcomeStatus;
  result: TOutput | null;
  error: Error | null;
  errorClass: FetchErrorClass | null;
  httpStatus: number | null;
  fetchMs: number;
  pipelineMs: number;
  attempt: number;  // 1-indexed for success, 0 for all-failed
}

// ── Batch stats ──────────────────────────────────────────────────────

export interface BatchStats<TOutput> {
  batchIndex: number;
  wallMs: number;
  items: ItemOutcome<TOutput>[];
  successCount: number;
  emptyCount: number;
  errorCount: number;
  errorBreakdown: Record<FetchErrorClass, number>;
}

export interface PercentileStats {
  avg: number;
  p50: number;
  p95: number;
  min: number;
  max: number;
}

export interface TimedBatchStats<TOutput> {
  batches: BatchStats<TOutput>[];
  overall: {
    totalItems: number;
    successCount: number;
    emptyCount: number;
    errorCount: number;
    errorBreakdown: Record<FetchErrorClass, number>;
    fetchMs: PercentileStats;
    pipelineMs: PercentileStats;
    wallMsTotal: number;
    elapsedMs: number;
  };
}

// ── Timing handle ────────────────────────────────────────────────────

export interface TimingHandle {
  setFetchStart(): void;
}

// ── Options ──────────────────────────────────────────────────────────

export interface TimedBatchOptions {
  concurrency: number;
  interBatchDelayMs?: number;
  maxRetries?: number;
  retryBackoffMs?: number;
  retryAfterCapMs?: number;
  onBatchComplete?: (stats: BatchStats<unknown>) => void;
}

// ── ProcessFn type ───────────────────────────────────────────────────

export type TimedProcessFn<TInput, TOutput> = (
  item: TInput,
  index: number,
  timing: TimingHandle,
) => Promise<TOutput | null>;

// ── Percentile helper ────────────────────────────────────────────────

export function computePercentiles(values: number[]): PercentileStats {
  if (values.length === 0) {
    return { avg: 0, p50: 0, p95: 0, min: 0, max: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    avg: Math.round(sum / sorted.length),
    p50: sorted[Math.ceil(0.50 * sorted.length) - 1],
    p95: sorted[Math.ceil(0.95 * sorted.length) - 1],
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

// ── Empty error breakdown ────────────────────────────────────────────

function emptyBreakdown(): Record<FetchErrorClass, number> {
  return { rate_limit: 0, server_error: 0, timeout: 0, network: 0, parse_fail: 0, other: 0 };
}

// ── Single item execution with retries ───────────────────────────────

async function executeItem<TInput, TOutput>(
  item: TInput,
  index: number,
  processFn: TimedProcessFn<TInput, TOutput>,
  maxRetries: number,
  retryBackoffMs: number,
  retryAfterCapMs: number,
): Promise<ItemOutcome<TOutput>> {
  const totalAttempts = 1 + maxRetries;

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    let fetchStartMs: number | null = null;
    const pipelineStart = performance.now();

    const timing: TimingHandle = {
      setFetchStart() {
        if (fetchStartMs === null) fetchStartMs = performance.now();
      },
    };

    try {
      const result = await processFn(item, index, timing);
      const pipelineEnd = performance.now();
      const pipelineMs = Math.round(pipelineEnd - pipelineStart);
      const fetchMs = fetchStartMs !== null
        ? Math.round(pipelineEnd - fetchStartMs)
        : pipelineMs;

      if (result !== null) {
        return {
          index, status: 'success', result, error: null,
          errorClass: null, httpStatus: null,
          fetchMs, pipelineMs, attempt,
        };
      }
      return {
        index, status: 'empty', result: null, error: null,
        errorClass: null, httpStatus: null,
        fetchMs, pipelineMs, attempt,
      };
    } catch (err) {
      const pipelineEnd = performance.now();
      const pipelineMs = Math.round(pipelineEnd - pipelineStart);
      const fetchMs = fetchStartMs !== null
        ? Math.round(pipelineEnd - fetchStartMs)
        : pipelineMs;
      const error = err instanceof Error ? err : new Error(String(err));
      const errorClass = classifyFetchError(error);
      const httpStatus = typeof (err as unknown as Record<string, unknown>).status === 'number'
        ? (err as unknown as Record<string, unknown>).status as number
        : typeof (err as unknown as Record<string, unknown>).statusCode === 'number'
          ? (err as unknown as Record<string, unknown>).statusCode as number
          : null;

      // Only retry rate_limit and server_error
      const retryable = errorClass === 'rate_limit' || errorClass === 'server_error';
      if (retryable && attempt < totalAttempts) {
        // Determine backoff
        let backoff = retryBackoffMs * Math.pow(2, attempt - 1);
        // Parse Retry-After if available
        const retryAfter = (err as unknown as Record<string, unknown>).retryAfter;
        if (typeof retryAfter === 'number') {
          backoff = Math.min(retryAfter * 1000, retryAfterCapMs);
        }
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }

      return {
        index, status: 'error', result: null, error,
        errorClass, httpStatus,
        fetchMs, pipelineMs, attempt: 0,
      };
    }
  }

  // Unreachable
  throw new Error('executeItem: unreachable');
}

// ── Main export ──────────────────────────────────────────────────────

export async function timedBatchProcess<TInput, TOutput>(
  items: TInput[],
  processFn: TimedProcessFn<TInput, TOutput>,
  opts: TimedBatchOptions,
): Promise<{ outcomes: ItemOutcome<TOutput>[]; stats: TimedBatchStats<TOutput> }> {
  const concurrency = opts.concurrency;
  const interBatchDelayMs = opts.interBatchDelayMs ?? 0;
  const maxRetries = opts.maxRetries ?? 0;
  const retryBackoffMs = opts.retryBackoffMs ?? 1000;
  const retryAfterCapMs = opts.retryAfterCapMs ?? 5000;

  const outcomes: ItemOutcome<TOutput>[] = new Array(items.length);
  const batches: BatchStats<TOutput>[] = [];
  const overallStart = performance.now();

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchIndices = batch.map((_, k) => i + k);

    if (i > 0 && interBatchDelayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, interBatchDelayMs));
    }

    const batchStart = performance.now();
    const settled = await Promise.allSettled(
      batch.map((item, k) =>
        executeItem(item, batchIndices[k], processFn, maxRetries, retryBackoffMs, retryAfterCapMs),
      ),
    );
    const wallMs = Math.round(performance.now() - batchStart);

    const batchItems: ItemOutcome<TOutput>[] = [];
    for (const result of settled) {
      // executeItem never rejects — it always returns an outcome
      const outcome = (result as PromiseFulfilledResult<ItemOutcome<TOutput>>).value;
      outcomes[outcome.index] = outcome;
      batchItems.push(outcome);
    }

    const breakdown = emptyBreakdown();
    let successCount = 0;
    let emptyCount = 0;
    let errorCount = 0;
    for (const o of batchItems) {
      if (o.status === 'success') successCount++;
      else if (o.status === 'empty') emptyCount++;
      else {
        errorCount++;
        if (o.errorClass) breakdown[o.errorClass]++;
      }
    }

    const batchStats: BatchStats<TOutput> = {
      batchIndex: batches.length,
      wallMs,
      items: batchItems,
      successCount,
      emptyCount,
      errorCount,
      errorBreakdown: breakdown,
    };
    batches.push(batchStats);

    if (opts.onBatchComplete) {
      opts.onBatchComplete(batchStats as BatchStats<unknown>);
    }
  }

  const elapsedMs = Math.round(performance.now() - overallStart);

  // Compute overall stats
  const overallBreakdown = emptyBreakdown();
  let totalSuccess = 0;
  let totalEmpty = 0;
  let totalError = 0;
  const fetchMsValues: number[] = [];
  const pipelineMsValues: number[] = [];
  let wallMsTotal = 0;

  for (const b of batches) {
    wallMsTotal += b.wallMs;
    totalSuccess += b.successCount;
    totalEmpty += b.emptyCount;
    totalError += b.errorCount;
    for (const cls of Object.keys(b.errorBreakdown) as FetchErrorClass[]) {
      overallBreakdown[cls] += b.errorBreakdown[cls];
    }
    for (const o of b.items) {
      if (o.status !== 'error') {
        fetchMsValues.push(o.fetchMs);
        pipelineMsValues.push(o.pipelineMs);
      }
    }
  }

  const stats: TimedBatchStats<TOutput> = {
    batches,
    overall: {
      totalItems: items.length,
      successCount: totalSuccess,
      emptyCount: totalEmpty,
      errorCount: totalError,
      errorBreakdown: overallBreakdown,
      fetchMs: computePercentiles(fetchMsValues),
      pipelineMs: computePercentiles(pipelineMsValues),
      wallMsTotal,
      elapsedMs,
    },
  };

  return { outcomes, stats };
}
