/**
 * Internal diagnostic / error code system.
 *
 * ┌─ LEAK-SAFETY GUARANTEE ────────────────────────────────────────────────┐
 * │ This module ONLY emits opaque codes to user-visible channels:          │
 * │   • log.error     → "[LIN-1234] <USER_FACING_MESSAGE>"                 │
 * │   • log.debug     → "[LIN-1234]" (no meaning/detail/cause)             │
 * │   • setStatusMsg  → "LIN-1234" only                                    │
 * │   • UserSafeError → "[LIN-1234] <USER_FACING_MESSAGE>"                 │
 * │                                                                        │
 * │ All rich data (meaning, detail, cause, payload) goes ONLY to the       │
 * │ remote sink (operator). Sink failures swallowed — never bubble.        │
 * │                                                                        │
 * │ DO NOT MODIFY: log.error/log.debug/setStatusMessage call sites below.  │
 * │ DO NOT replace USER_FACING_MESSAGE with a templated string that        │
 * │ interpolates user input or internal state.                             │
 * │                                                                        │
 * │ Caller-side leak risks (NOT this module's responsibility — guard in    │
 * │ main.ts):                                                              │
 * │   1. log.info('Phase 2 ' + ...)         ← caller leaks methodology    │
 * │   2. Actor.fail(err.message)             ← wrap with userSafeError()  │
 * │   3. log.error(cause.stack)              ← internal detail in user log│
 * │   4. Actor.setStatusMessage('Failed: ' + cause)  ← raw cause leaks    │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Codes are stable identifiers — do not renumber after release.
 *   1xxx — initialization
 *   2xxx — fetch / network
 *   3xxx — parse / data
 *   4xxx — state / persistence
 *   9xxx — uncategorized / catch-all
 *
 * Wire-up: requires `OPS_INGEST_URL` + `OPS_SECRET` env vars on the actor.
 */

import { Actor, log } from 'apify';

export const ERR = {
  'LIN-1001': 'init.input.invalid',
  'LIN-1010': 'init.lock_busy',

  'LIN-2001': 'fetch.network',
  'LIN-2010': 'fetch.api_error',
  'LIN-2020': 'fetch.no_results',
  'LIN-2030': 'fetch.rate_limited',

  'LIN-3001': 'parse.invalid_response',

  'LIN-4001': 'state.lock.lost',
  'LIN-4002': 'state.kv.unavailable',

  'LIN-9000': 'unhandled',
} as const;

export type ErrCode = keyof typeof ERR;

const USER_FACING_MESSAGE = 'Failed to scrape LinkedIn jobs. Please try again later.';

const STATUS_PREFIX = 'LIN-1';

export type EventType = 'run.start' | 'run.complete' | 'error' | 'info';

interface EmitInput {
  type: EventType;
  code?: ErrCode;
  detail?: string;
  cause?: unknown;
  page?: number;
  targetDomain?: string;
  payload?: Record<string, unknown>;
}

export class UserSafeError extends Error {
  readonly code: ErrCode;
  readonly internalCause: unknown;
  constructor(message: string, code: ErrCode, internalCause: unknown) {
    super(message);
    this.name = 'UserSafeError';
    this.code = code;
    this.internalCause = internalCause;
  }
}

export function userSafeError(internalCause: unknown, code: ErrCode): UserSafeError {
  return new UserSafeError(`[${code}] ${USER_FACING_MESSAGE}`, code, internalCause);
}

const SECRET_PATTERNS = /(?:cookie|cookies|password|secret|token|apikey|api_key|authcookie|sessionstate|storagestate|jwt|webhook|telegramchatid|whatsappaccesstoken)/i;
export function sanitizeInputForDiag(input: unknown, depth = 0): unknown {
  if (input == null || typeof input !== 'object' || depth > 6) return input;
  if (Array.isArray(input)) return input.map(v => sanitizeInputForDiag(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (SECRET_PATTERNS.test(k)) {
      out[k] = typeof v === 'string' ? `[redacted:${v.length}c]` : '[redacted]';
    } else {
      out[k] = sanitizeInputForDiag(v, depth + 1);
    }
  }
  return out;
}

function safeStringify(v: unknown): string {
  try {
    if (v instanceof UserSafeError) {
      const inner = safeStringify(v.internalCause);
      return `${v.code} ${inner}`;
    }
    if (v instanceof Error) return `${v.name}: ${v.message}`;
    if (typeof v === 'string') return v;
    return JSON.stringify(v);
  } catch {
    return '[unserializable]';
  }
}

function getEnvSafe(name: string): string | undefined {
  return process.env[name] || undefined;
}

interface ApifyEnv {
  actorId: string;
  actorRunId: string;
  userId: string;
}

function getApifyEnv(): ApifyEnv {
  const env = Actor.getEnv();
  return {
    actorId: env.actorId ?? 'local',
    actorRunId: env.actorRunId ?? `local-${Date.now()}`,
    userId: env.userId ?? 'local',
  };
}

async function postToSink(payload: Record<string, unknown>): Promise<void> {
  const url = getEnvSafe('OPS_INGEST_URL');
  const secret = getEnvSafe('OPS_SECRET');
  if (!url || !secret) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-diag-secret': secret },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Diagnostic sink failures must never affect main run.
  }
}

export async function emit(input: EmitInput): Promise<void> {
  const env = getApifyEnv();
  const ts = Date.now();

  if (input.type === 'error' && input.code) {
    log.error(`[${input.code}] ${USER_FACING_MESSAGE}`);
  }

  const meaning = input.code ? ERR[input.code] : input.type;
  log.debug(`[${input.code ?? input.type}]`);

  if (input.code && input.code.startsWith(STATUS_PREFIX)) {
    try {
      await Actor.setStatusMessage(`${input.code}`, { isStatusMessageTerminal: false });
    } catch {
      // ignore
    }
  }

  const sinkPayload = {
    ts,
    type: input.type,
    code: input.code ?? null,
    meaning,
    actorId: env.actorId,
    runId: env.actorRunId,
    userId: env.userId,
    detail: input.detail ?? null,
    page: input.page ?? null,
    targetDomain: input.targetDomain ?? null,
    cause: input.cause ? safeStringify(input.cause) : null,
    payload: input.payload ?? null,
  };
  if (input.type === 'run.start' || input.type === 'run.complete') {
    await postToSink(sinkPayload);
  } else {
    void postToSink(sinkPayload);
  }
}

export function emitSync(input: EmitInput): void {
  void emit(input);
}
