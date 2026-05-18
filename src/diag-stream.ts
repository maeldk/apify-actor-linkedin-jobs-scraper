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
    buffer.push({ ts: Date.now(), stream, line });
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
  } catch {
    // Ignore initialization failures.
  }
}

install();

export {};
