/**
 * openIncrementalState — canonical incremental-state initialiser.
 *
 * Wraps the `Actor.openKeyValueStore(<name>) + tryAcquire + verifyLock`
 * sequence that 80+ actors currently inline. Provides a single
 * decision-point for what to do when the named KV store cannot be opened
 * (typically a 403 under LIMITED_PERMISSIONS where the run-scoped token
 * lacks STORE_CREATE on the named store).
 *
 * Design notes:
 *  - Business logic is pure: `classifyOpenError`, `decideUxAction`,
 *    `formatDegradationLog`. These are unit-tested without any Apify SDK.
 *  - I/O is via an injectable `open` function (default: Actor.openKeyValueStore).
 *    Tests pass a mock. The `defaultHandler` does the Actor.fail / Actor.exit
 *    side effects; production callers use it via `await defaultHandler(result, ctx)`.
 *  - Caller decides: this module returns a tagged-union result; the caller
 *    (or `defaultHandler`) interprets it.
 *  - Lock acquire / verify / release are delegated to `./stateLock.js`.
 *
 * See INCREMENTAL_STATE_HELPER_PROPOSAL.md and
 * INCREMENTAL_DEGRADATION_UX_DECISION.md under
 * apify-meta/_portfolio-audit/ for the design rationale.
 */

import { lockKvKey, tryAcquire, verifyLock, type StateLock } from './stateLock.js';

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface KeyValueStoreLike {
  getValue<T>(key: string): Promise<T | null>;
  setValue<T>(key: string, value: T | null): Promise<void>;
}

export type KvStoreOpener = (name: string) => Promise<KeyValueStoreLike>;

export interface OpenIncrementalStateOptions {
  /** Named KV store, e.g. 'bilbasen-incremental' or 'adzuna-scraper-state'. */
  storeName: string;
  /** Logical key used by the lock and to scope state. */
  stateKey: string;
  /** Run identifier used by the lock. Pass APIFY_ACTOR_RUN_ID or a fallback. */
  runId: string;
}

export type OpenUnavailableReason = 'permission' | 'platform' | 'other';

export type OpenedLockReason = 'ok' | 'stale_override';

export type OpenResult =
  | {
      kind: 'opened';
      store: KeyValueStoreLike;
      stateKey: string;
      lockAcquired: true;
      lockReason: OpenedLockReason;
      /** Run ID of the previous holder if we took over via stale_override; else null. */
      previousHolder: string | null;
      /** Verifies + nulls the lock record. Safe to call in finally{}. Best-effort: never throws. */
      releaseLock: () => Promise<void>;
    }
  | {
      kind: 'lock_busy';
      stateKey: string;
      holder?: string;
      acquiredAt?: string;
    }
  | {
      kind: 'unavailable';
      reason: OpenUnavailableReason;
      error: Error;
    };

export interface UxContext {
  /** Caller-side switch: when true, "unavailable" degrades to non-incremental. */
  allowNonIncrementalFallback: boolean;
  /** Actor ID; defaulted from APIFY_ACTOR_ID inside isCanaryRun(). */
  actorId?: string;
}

export type UxAction =
  | { kind: 'proceed' }                              // run incremental
  | { kind: 'exit_gracefully'; reason: 'lock_busy' } // Actor.exit (success)
  | { kind: 'degrade'; reason: 'canary' | 'opt_in' }
  | { kind: 'fail'; code: 'INCREMENTAL_UNAVAILABLE'; cause: Error };

/* ── Pure logic ─────────────────────────────────────────────────────────── */

/**
 * Classify an error thrown by `Actor.openKeyValueStore`. Permission failures
 * are the most common; others are platform errors or genuinely unexpected.
 */
export function classifyOpenError(err: unknown): OpenUnavailableReason {
  if (!(err instanceof Error)) return 'other';

  const e = err as Error & { statusCode?: number };
  if (e.statusCode === 403) return 'permission';
  if (e.statusCode && e.statusCode >= 500 && e.statusCode <= 599) return 'platform';

  const msg = err.message ?? '';
  if (/insufficient permissions/i.test(msg)) return 'permission';
  if (/\b(403|forbidden|unauthori[sz]ed)\b/i.test(msg)) return 'permission';
  if (/\b5\d{2}\b/.test(msg) && /\b(http|status|server|api)\b/i.test(msg)) return 'platform';
  if (/timeout|timedout|econn|enotfound|network|socket|fetch failed/i.test(msg)) return 'platform';
  return 'other';
}

/**
 * Decide what the UX should do given an OpenResult and caller context.
 * Pure — no side effects. Caller passes the result to `defaultHandler` to
 * actually perform Actor.fail / Actor.exit. Tests verify this function
 * directly.
 */
export function decideUxAction(result: OpenResult, ctx: UxContext, isCanary: boolean): UxAction {
  if (result.kind === 'opened') {
    return { kind: 'proceed' };
  }
  if (result.kind === 'lock_busy') {
    return { kind: 'exit_gracefully', reason: 'lock_busy' };
  }
  // result.kind === 'unavailable'
  if (isCanary) {
    return { kind: 'degrade', reason: 'canary' };
  }
  if (ctx.allowNonIncrementalFallback) {
    return { kind: 'degrade', reason: 'opt_in' };
  }
  return { kind: 'fail', code: 'INCREMENTAL_UNAVAILABLE', cause: result.error };
}

/**
 * Produce a user-visible log message for the degradation path. Opaque per
 * OPSEC rules: no methodology, no operator infra. Used by `defaultHandler`.
 */
export function formatDegradationLog(result: Extract<OpenResult, { kind: 'unavailable' }>): string {
  switch (result.reason) {
    case 'permission':
      return 'Incremental state store is not accessible on this account. Continuing as non-incremental.';
    case 'platform':
      return 'Incremental state store is temporarily unavailable. Continuing as non-incremental.';
    default:
      return 'Incremental state store could not be opened. Continuing as non-incremental.';
  }
}

/**
 * Opaque fail message for the loud-fail path. Caller passes to Actor.fail().
 * Carries the public error code, omits internal cause. OPSEC: neutral
 * wording — no service-relationship hints ("contact the actor owner" /
 * support channels), no infra references.
 */
export const INCREMENTAL_UNAVAILABLE_USER_MESSAGE =
  'INCREMENTAL_UNAVAILABLE: incremental mode was requested but the state store is not accessible on this account. ' +
  'Retry with incremental mode disabled, or contact support if this persists.';

/* ── Orchestrator (I/O) ─────────────────────────────────────────────────── */

/**
 * Attempt to open the named KV store and acquire the lock. Returns a tagged
 * union the caller can dispatch on, or pass to `defaultHandler` for the
 * recommended Hybrid UX.
 *
 * Failure modes:
 *   - 'unavailable.permission' — 403 / Insufficient permissions
 *   - 'unavailable.platform'   — 5xx / network
 *   - 'unavailable.other'      — anything else
 *   - 'lock_busy'              — store opened, but another run holds the lock
 *
 * Success:
 *   - 'opened.store'           — KV store handle
 *   - 'opened.lockAcquired'    — true (false only if stale_override path)
 *   - 'opened.releaseLock'     — call in finally{} to write null lock record
 *
 * The `deps.open` injection makes this fully testable without the Apify SDK.
 */
export async function openIncrementalState(
  opts: OpenIncrementalStateOptions,
  deps: { open: KvStoreOpener },
): Promise<OpenResult> {
  let store: KeyValueStoreLike;
  try {
    store = await deps.open(opts.storeName);
  } catch (err) {
    return {
      kind: 'unavailable',
      reason: classifyOpenError(err),
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }

  const lockKey = lockKvKey(opts.stateKey);
  let existingLock: StateLock | null;
  try {
    existingLock = await store.getValue<StateLock>(lockKey);
  } catch (err) {
    return {
      kind: 'unavailable',
      reason: classifyOpenError(err),
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }

  const { result, newLock } = tryAcquire(existingLock, opts.runId, opts.stateKey);
  if (!result.acquired) {
    return {
      kind: 'lock_busy',
      stateKey: opts.stateKey,
      holder: result.holder,
      acquiredAt: result.acquiredAt,
    };
  }

  if (newLock) {
    try {
      await store.setValue(lockKey, newLock);
    } catch (err) {
      return {
        kind: 'unavailable',
        reason: classifyOpenError(err),
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
  }

  // releaseLock verifies ownership before nulling. Without this check, a run
  // that lost its lock via stale_override (i.e. a later run took over after
  // 30 min) would still null the record on the way out — wiping the new
  // holder's lock. Best-effort: any error during verify/release is swallowed
  // because the LEASE_TTL_MS auto-recovery covers the worst case.
  const releaseLock = async (): Promise<void> => {
    try {
      const current = await store.getValue<StateLock>(lockKey);
      if (!verifyLock(current, opts.runId)) return; // lock was stolen — leave it alone
      await store.setValue<StateLock | null>(lockKey, null);
    } catch {
      // ignore
    }
  };

  const lockReason: OpenedLockReason = result.reason === 'stale_override' ? 'stale_override' : 'ok';
  const previousHolder = lockReason === 'stale_override' && existingLock ? existingLock.runId : null;

  return {
    kind: 'opened',
    store,
    stateKey: opts.stateKey,
    lockAcquired: true,
    lockReason,
    previousHolder,
    releaseLock,
  };
}

/* ── Default handler (Apify-aware) ──────────────────────────────────────── */

/**
 * Apify-aware adapter shape. The caller is expected to pass real
 * `log` + `Actor` from 'apify' (or compatible mocks in tests). This avoids
 * importing 'apify' at the top of this module, keeping the pure-logic
 * portion runtime-free.
 */
export interface ApifyAdapter {
  log: { info: (msg: string) => void; warning: (msg: string) => void; error: (msg: string) => void };
  actor: { exit: () => Promise<void>; fail: (msg: string) => Promise<void> };
  isCanaryRun: (actorId?: string) => boolean;
  /**
   * Terminate the process after a *successful* terminal action (e.g.
   * Actor.exit() on lock_busy). Production callers pass `() => process.exit(0)`.
   * Required for top-level-await scripts: Apify's SDK returns
   * `Promise<void>` and control resumes after the await, so without an
   * explicit exit the rest of the script would keep running.
   */
  hardExitSuccess?: () => void;
  /**
   * Terminate the process after Actor.fail(). Distinct from the success
   * path so the OS exit code reflects the actual run outcome: pass
   * `() => process.exit(1)`. Apify's run status is already set by
   * Actor.fail(), so this affects only the process exit code — but a
   * non-zero exit makes failure observable in any shell wrapper or CI.
   */
  hardExitFailure?: () => void;

  /**
   * Optional actor-side hook fired when `openResult.kind === 'lock_busy'`,
   * BEFORE the helper logs the standard "previous run still active"
   * warning and calls Actor.exit(). Use this to emit actor-specific
   * diag/telemetry events (e.g. `run.complete` to ops sink with
   * `reason: 'lock_busy'`). Hook errors are swallowed.
   */
  onLockBusy?: (busy: Extract<OpenResult, { kind: 'lock_busy' }>) => Promise<void>;
  /**
   * Optional actor-side hook fired when `openResult.kind === 'unavailable'`
   * AND the decision is `fail` (not degrade), BEFORE Actor.fail() is
   * called. Use to emit actor-specific failure diag with an ErrCode.
   * Hook errors are swallowed.
   */
  onIncrementalUnavailableFail?: (un: Extract<OpenResult, { kind: 'unavailable' }>) => Promise<void>;
}

/**
 * Apply the recommended Hybrid UX policy.
 *
 * Return contract:
 *   - true  → caller should continue with incremental mode enabled.
 *   - false → caller should treat run as non-incremental (lock acquire failed
 *             but degradation was allowed by canary or opt-in).
 *
 * The lock_busy and fail paths do NOT return; they call hardExit() (or
 * throw) so the caller can rely on `if (!handlerResult) { input.incremental = false; ... }`
 * without worrying about double-execution from top-level-await semantics.
 */
export async function defaultHandler(
  result: OpenResult,
  ctx: UxContext,
  apify: ApifyAdapter,
): Promise<boolean> {
  const action = decideUxAction(result, ctx, apify.isCanaryRun(ctx.actorId));

  switch (action.kind) {
    case 'proceed':
      // Surface stale-override takeover so operators can spot lost-state
      // events (the previous holder presumably crashed without releasing).
      if (result.kind === 'opened' && result.lockReason === 'stale_override') {
        apify.log.warning(
          `Took over stale incremental state lock for "${result.stateKey}"` +
          (result.previousHolder ? ` (previous holder: ${result.previousHolder}).` : '.'),
        );
      }
      return true;

    case 'exit_gracefully':
      if (result.kind === 'lock_busy' && apify.onLockBusy) {
        try { await apify.onLockBusy(result); } catch { /* swallow hook errors */ }
      }
      apify.log.warning('A previous run is still active for this stateKey. Exiting cleanly to avoid state corruption.');
      await apify.actor.exit();
      // Belt-and-braces for top-level-await scripts. lock_busy is a SUCCESS
      // outcome (the run did the right thing by not stepping on another
      // holder) → exit 0.
      apify.hardExitSuccess?.();
      return false;

    case 'degrade':
      if (result.kind === 'unavailable') {
        apify.log.warning(formatDegradationLog(result));
      }
      return false;

    case 'fail':
      if (result.kind === 'unavailable' && apify.onIncrementalUnavailableFail) {
        try { await apify.onIncrementalUnavailableFail(result); } catch { /* swallow */ }
      }
      await apify.actor.fail(INCREMENTAL_UNAVAILABLE_USER_MESSAGE);
      // Non-zero exit so shell wrappers / CI see the failure. Apify's run
      // status is already FAILED from Actor.fail(); this is belt-and-braces.
      apify.hardExitFailure?.();
      // If hardExitFailure isn't wired (tests, or by accident), throw to
      // guarantee the caller cannot continue. The thrown error carries
      // the internal cause for diag; user-visible message already set.
      throw action.cause;
  }
}
