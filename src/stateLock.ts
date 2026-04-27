/**
 * Soft lock for incremental stateKey to prevent concurrent run corruption.
 *
 * Uses a KV record `state-lock_<stateKey>` with runId + timestamp.
 * Before reading state, the actor acquires the lock.
 * Before writing state, the actor verifies it still holds the lock.
 * Stale locks auto-expire after LEASE_TTL_MS (default 30 minutes).
 *
 * NOT a distributed lock — there's a small race window between
 * check-and-write. But it prevents the common case: two runs
 * started seconds apart from silently overwriting each other.
 */

export interface StateLock {
  runId: string;
  acquiredAt: string; // ISO-8601
  stateKey: string;
}

const LEASE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function lockKvKey(stateKey: string): string {
  return `state-lock_${stateKey}`;
}

/**
 * Check if an existing lock is stale (expired lease).
 */
export function isLockExpired(lock: StateLock, now: Date = new Date()): boolean {
  const acquiredMs = new Date(lock.acquiredAt).getTime();
  if (isNaN(acquiredMs)) return true; // malformed → treat as expired
  return now.getTime() - acquiredMs > LEASE_TTL_MS;
}

export interface LockResult {
  acquired: boolean;
  reason?: 'ok' | 'conflict' | 'stale_override';
  holder?: string; // runId of current holder (if conflict)
  acquiredAt?: string; // when the conflicting lock was taken
}

/**
 * Try to acquire the lock. Returns success/failure with reason.
 */
export function tryAcquire(
  existing: StateLock | null,
  runId: string,
  stateKey: string,
  now: Date = new Date(),
): { result: LockResult; newLock: StateLock | null } {
  // No existing lock → acquire
  if (!existing) {
    const newLock: StateLock = { runId, acquiredAt: now.toISOString(), stateKey };
    return { result: { acquired: true, reason: 'ok' }, newLock };
  }

  // Same run re-acquiring (idempotent)
  if (existing.runId === runId) {
    return { result: { acquired: true, reason: 'ok' }, newLock: null };
  }

  // Different run — check if stale
  if (isLockExpired(existing, now)) {
    const newLock: StateLock = { runId, acquiredAt: now.toISOString(), stateKey };
    return { result: { acquired: true, reason: 'stale_override' }, newLock };
  }

  // Active lock held by another run → conflict
  return {
    result: {
      acquired: false,
      reason: 'conflict',
      holder: existing.runId,
      acquiredAt: existing.acquiredAt,
    },
    newLock: null,
  };
}

/**
 * Verify the lock is still held by this run before writing state.
 * Returns true if safe to write, false if lock was stolen.
 */
export function verifyLock(
  current: StateLock | null,
  runId: string,
): boolean {
  if (!current) return false; // lock disappeared
  return current.runId === runId;
}
