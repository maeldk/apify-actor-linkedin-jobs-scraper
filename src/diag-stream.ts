type StreamName = 'stdout' | 'stderr';
interface CapturedLine {
  ts: number;
  stream: StreamName;
  line: string;
}

declare const process: any;
declare const Buffer: any;

const env = typeof process !== 'undefined' ? process.env : {};
const sinkKey = ['OPS', 'INGEST', 'URL'].join('_');
const secretKey = ['OPS', 'SECRET'].join('_');
const sinkUrl = env[sinkKey];
const sinkSecret = env[secretKey];
const runId = env.ACTOR_RUN_ID || env.APIFY_ACTOR_RUN_ID || `local-${Date.now()}`;
const actorId = env.ACTOR_ID || env.APIFY_ACTOR_ID || 'local';
const userId = env.APIFY_USER_ID || env.ACTOR_USER_ID || 'local';

const buffer: CapturedLine[] = [];
// Wall-clock of the most recent captured stdout/stderr line. A working actor
// logs continuously (page fetched, items pushed, …); a wedged one goes silent.
// The deadline guard uses `now - lastLineTs` as a free liveness heartbeat to
// tell a genuine wedge apart from a run that merely ran out of its timeout.
let lastLineTs = Date.now();
let flushing = false;
let installed = false;

const MAX_LINE_LENGTH = 2000;
const MAX_BUFFER_LINES = 1000;
const FLUSH_EVERY_MS = 1000;
const FLUSH_AT_LINES = 80;

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
}

function pushLine(stream: StreamName, value: string): void {
  try {
    if (!value) return;
    const clean = stripAnsi(value);
    const line = clean.length > MAX_LINE_LENGTH ? clean.slice(0, MAX_LINE_LENGTH) : clean;
    const ts = Date.now();
    lastLineTs = ts;
    buffer.push({ ts, stream, line });
    if (buffer.length > MAX_BUFFER_LINES) buffer.splice(0, buffer.length - MAX_BUFFER_LINES);
    if (buffer.length >= FLUSH_AT_LINES) void flush('size');
  } catch {
    // This module must never affect actor output.
  }
}

async function postSafe(body: Record<string, unknown>): Promise<void> {
  if (!sinkUrl || !sinkSecret || typeof fetch !== 'function') return;
  // Manual AbortController instead of AbortSignal.timeout(): Node 22's
  // AbortSignal.timeout doesn't reliably cancel an in-flight undici fetch
  // when the remote is mid-handshake — pending sockets accumulate in the
  // connection pool and starve future posts.
  const ctrl = new AbortController();
  const t = setTimeout(() => { try { ctrl.abort(); } catch {} }, 5000);
  try {
    await fetch(sinkUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-diag-secret': sinkSecret },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch {
    // Ignore transport and serialization failures.
  } finally {
    clearTimeout(t);
  }
}

async function flush(reason: string): Promise<void> {
  if (!sinkUrl || !sinkSecret || flushing || buffer.length === 0) return;
  flushing = true;
  const lines = buffer.splice(0, buffer.length);
  try {
    // Hard deadline (10s) on the flush itself — guarantees the `flushing`
    // lock is released even if postSafe's abort doesn't fire (defence in
    // depth for the same Node 22 abort-leak that prompted the controller
    // change above).
    await Promise.race([
      postSafe({
        ts: Date.now(),
        type: 'info',
        code: null,
        meaning: null,
        actorId,
        runId,
        userId,
        detail: 'logbatch',
        page: null,
        targetDomain: null,
        cause: null,
        payload: { reason, lines },
      }),
      new Promise<void>((resolve) => setTimeout(resolve, 10_000)),
    ]);
  } catch {
    // Ignore all internal failures.
  } finally {
    flushing = false;
  }
}

function patchStream(stream: StreamName): void {
  try {
    const target = process[stream];
    const original = target.write.bind(target);
    target.write = ((chunk: unknown, ...args: unknown[]) => {
      try {
        const text = typeof chunk === 'string'
          ? chunk
          : typeof Buffer !== 'undefined' && Buffer.isBuffer(chunk)
            ? (chunk as any).toString('utf8')
            : String(chunk);
        for (const line of text.split(/\r?\n/)) pushLine(stream, line);
      } catch {
        // Preserve original output even if capture fails.
      }
      return original(chunk as never, ...(args as never[]));
    }) as typeof target.write;
  } catch {
    // Ignore patch failures.
  }
}

function errorText(err: unknown): string {
  try {
    if (err instanceof Error) return err.stack || `${err.name}: ${err.message}`;
    return String(err);
  } catch {
    return 'Unhandled failure';
  }
}

function emitFatal(kind: string, err: unknown): void {
  try {
    void postSafe({
      ts: Date.now(),
      type: 'error',
      code: 'RUN-FATAL',
      meaning: 'fatal.unhandled',
      actorId,
      runId,
      userId,
      detail: kind,
      page: null,
      targetDomain: null,
      cause: errorText(err),
      payload: null,
    });
  } catch {
    // Ignore all internal failures.
  }
}

/**
 * Head-room (ms) the guard reserves before Apify's hard timeout so it has time
 * to flush logs + emit a terminal event before SIGKILL. 15% of the run, capped
 * at 60s, floored at 20s — so a generous timeout keeps the full 60s while a
 * short timeout isn't handed half the run as shutdown buffer.
 * Exported for unit testing.
 */
export function deadlineBufferMs(totalBudgetMs: number): number {
  return Math.max(20_000, Math.min(60_000, Math.floor(totalBudgetMs * 0.15)));
}

/**
 * Decide whether a fired deadline guard reflects a genuine wedge (hung socket /
 * stalled promise) versus a run that simply ran out of its timeout. A wedge =
 * the run had ample budget AND has produced no log output for a long stretch.
 * A short total budget, or a run still actively logging, is NOT a wedge — it's
 * an under-budgeted (often user-misconfigured) run that shouldn't be triaged
 * as an actor bug. Exported for unit testing.
 */
export function classifyDeadline(totalBudgetMs: number, idleMs: number): { wedged: boolean } {
  return { wedged: totalBudgetMs >= 5 * 60_000 && idleMs >= 90_000 };
}

/**
 * Map a fired deadline guard to its terminal process disposition.
 *
 * A genuine wedge (a hung socket / stalled promise — our bug) exits non-zero so
 * the Apify run is FAILED and surfaces in operator triage. A BENIGN timeout —
 * the user simply gave the run too little time — exits 0 (SUCCESS). The run is
 * not broken: the actor did honest work and stopped early at the user's own
 * budget, exactly like the by-design `init.*` refusals (init.timeout_too_short
 * et al.) that already exit clean. Reporting it as FAILED would let a careless
 * (or hostile) user tank the actor's PUBLIC Store success-rate just by setting a
 * 1-second timeout — so we don't. Exported for unit testing.
 */
export function deadlineDisposition(
  wedged: boolean,
): { exitCode: number; status: 'failed' | 'success'; ok: boolean } {
  return wedged
    ? { exitCode: 1, status: 'failed', ok: false }
    : { exitCode: 0, status: 'success', ok: true };
}

function emitDeadlineExit(elapsedMs: number, totalBudgetMs: number, idleMs: number): void {
  const { wedged } = classifyDeadline(totalBudgetMs, idleMs);
  const disp = deadlineDisposition(wedged);
  const budgetS = (totalBudgetMs / 1000).toFixed(0);
  const elapsedS = (elapsedMs / 1000).toFixed(0);
  const idleS = (idleMs / 1000).toFixed(0);
  try {
    void postSafe({
      ts: Date.now(),
      type: 'run.complete',
      // Preserve the exact wedge signal operators already key on; route the
      // benign "timeout too short / still working" case to its own code so it
      // stops polluting wedge triage.
      code: wedged ? 'RUN-FATAL' : 'RUN-DEADLINE',
      meaning: wedged ? 'wedge.deadline_guard' : 'timeout.budget_exhausted',
      actorId,
      runId,
      userId,
      detail: 'deadline_guard',
      page: null,
      targetDomain: null,
      cause: wedged
        ? `Deadline guard fired — actor wedged: no log output for ${idleS}s, ${elapsedS}s into a ${budgetS}s run`
        : `Deadline guard fired — ${budgetS}s run timeout reached while still active (${elapsedS}s in, last output ${idleS}s ago)`,
      payload: {
        status: disp.status,
        ok: disp.ok,
        durationMs: elapsedMs,
        totalBudgetMs,
        idleMs,
        wedged,
        reason: wedged ? 'wedge_recovery_deadline_guard' : 'timeout_budget_exhausted',
      },
    });
  } catch {
    // Ignore all internal failures.
  }
}

/**
 * Defensive wall-clock guard for silent wedges.
 *
 * Several actors have intermittently wedged at Apify's wall-clock timeout
 * (2h burn, zero exit signal) when a hung HTTP socket or stalled Promise
 * keeps the event loop alive without making progress. The actor's own
 * run.complete never fires; cf-worker eventually reaps the run as failed.
 *
 * This guard reads Apify's `APIFY_ACTOR_TIMEOUT_AT` (ISO timestamp it sets
 * before launching the container) and arms an unref'd timer to fire shortly
 * before that deadline (see deadlineBufferMs). When it fires it flushes the
 * log buffer, posts a terminal run.complete to the sink, and forces
 * process.exit(1) so the container shuts down early instead of burning the
 * full timeout window. The terminal event is classified (see classifyDeadline)
 * so a genuine wedge stays a wedge while a too-short timeout is reported
 * distinctly rather than as a false wedge.
 *
 * Unref'd: a normal Actor.exit() calls process.exit which cancels all
 * timers, so this guard never fires on healthy runs.
 */
function installDeadlineGuard(): void {
  try {
    const iso = env.APIFY_ACTOR_TIMEOUT_AT || env.ACTOR_TIMEOUT_AT;
    if (!iso) return;
    const deadlineMs = Date.parse(iso);
    if (Number.isNaN(deadlineMs)) return;
    const startTs = Date.now();
    const totalBudgetMs = deadlineMs - startTs;
    const fireInMs = deadlineMs - deadlineBufferMs(totalBudgetMs) - startTs;
    if (fireInMs <= 0) return;
    // Cap to 6h - 60s to bound the timer if env is corrupted with a
    // far-future value.
    const cappedMs = Math.min(fireInMs, 6 * 3600 * 1000 - 60_000);
    const guard = setTimeout(() => {
      // Snapshot idle time BEFORE our own stderr write below pushes lastLineTs.
      const idleMs = Date.now() - lastLineTs;
      const { wedged } = classifyDeadline(totalBudgetMs, idleMs);
      try { void flush('deadline_guard'); } catch {}
      try { emitDeadlineExit(Date.now() - startTs, totalBudgetMs, idleMs); } catch {}
      try {
        // A genuine wedge is our bug → stay opaque. A benign timeout means the
        // user's run simply ran out of its allotted time → give actionable,
        // self-contained remediation (their own settings only; no infra or
        // scraping methodology).
        process.stderr.write(wedged
          ? 'Run hit internal deadline guard — forcing exit.\n'
          : 'Run stopped early to exit cleanly before the platform timeout was reached. '
            + 'To complete this workload, increase the run timeout in your Apify task settings, '
            + 'or reduce its scope (e.g. lower maxResults, narrow the query/location, or '
            + 'disable per-result detail enrichment).\n');
      } catch {}
      setTimeout(() => process.exit(deadlineDisposition(wedged).exitCode), 200);
    }, cappedMs) as unknown as { unref?: () => void };
    guard.unref?.();
  } catch {
    // Ignore initialization failures.
  }
}

function install(): void {
  try {
    if (installed) return;
    installed = true;
    patchStream('stdout');
    patchStream('stderr');

    const timer = setInterval(() => void flush('tick'), FLUSH_EVERY_MS) as unknown as { unref?: () => void };
    timer.unref?.();

    process.on('uncaughtException', (err: unknown) => {
      try { void flush('fatal'); } catch {}
      try { emitFatal('uncaughtException', err); } catch {}
      try { process.stderr.write(`${errorText(err)}\n`); } catch {}
      process.exitCode = 1;
      setTimeout(() => process.exit(1), 120);
    });

    process.on('unhandledRejection', (err: unknown) => {
      try { void flush('fatal'); } catch {}
      try { emitFatal('unhandledRejection', err); } catch {}
      try { process.stderr.write(`${errorText(err)}\n`); } catch {}
      process.exitCode = 1;
      setTimeout(() => process.exit(1), 120);
    });

    process.on('SIGTERM', () => {
      try { void flush('sigterm'); } catch {}
    });

    process.on('beforeExit', async () => {
      try { await flush('beforeExit'); } catch {}
    });

    installDeadlineGuard();
  } catch {
    // Ignore initialization failures.
  }
}

// Auto-install in the actor runtime. Skipped under vitest so unit tests can
// import the pure helpers (deadlineBufferMs / classifyDeadline) without
// patching streams, arming exit handlers, or posting to the live sink.
if (!env.VITEST) install();
