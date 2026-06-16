import { describe, expect, it, vi } from 'vitest';
import {
  COMPLETE_COVERAGE,
  buildUpdatedState,
  loadStateWithMigration,
  stateKvKey,
  type ClassifiedRecord,
} from '../src/incrementalState.js';

function makeStore(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getValue: vi.fn(async (key: string) => values.has(key) ? values.get(key) : null),
    setValue: vi.fn(async (key: string, value: unknown) => { values.set(key, value); }),
  };
}

function newClassification(jobId: string): ClassifiedRecord {
  return {
    jobId,
    changeType: 'NEW',
    contentHash: `content-${jobId}`,
    trackedHash: `tracked-${jobId}`,
    firstSeenAt: '2026-06-01T00:00:00.000Z',
    lastSeenAt: '2026-06-01T00:00:00.000Z',
    previousSeenAt: null,
    expiredAt: null,
  };
}

describe('loadStateWithMigration()', () => {
  it('loads scoped v2 state from a fingerprinted key', async () => {
    const key = stateKvKey('scope', 'fp-a');
    const state = buildUpdatedState('scope', 'fp-a', '2026-06-01T00:00:00.000Z', null, [newClassification('job-1')]);
    const store = makeStore({ [key]: state });

    const loaded = await loadStateWithMigration(store, 'scope', 'fp-a');
    expect(loaded.key).toBe(key);
    expect(loaded.coverage).toBe(COMPLETE_COVERAGE);
    expect(loaded.state?.jobs['job-1']?.active).toBe(true);
  });

  it('starts fresh when only legacy raw state exists', async () => {
    const legacy = { version: 1, stateKey: 'scope', updatedAt: '2026-05-01T00:00:00.000Z', jobs: { old: {} } };
    const store = makeStore({ state_scope: legacy });

    const loaded = await loadStateWithMigration(store, 'scope', 'fp-b');
    expect(loaded.migrated).toBe(true);
    expect(loaded.migratedFromKey).toBe('state_scope');
    expect(loaded.state).toBeNull();
    expect(loaded.coverage).toEqual({ complete: false, reason: 'no_prior_state' });
  });

  it('marks mismatched scoped records as corrupt', async () => {
    const store = makeStore({ [stateKvKey('scope', 'fp-c')]: { version: 2, stateKey: 'scope', queryFingerprint: 'other', jobs: {} } });

    const loaded = await loadStateWithMigration(store, 'scope', 'fp-c');
    expect(loaded.state).toBeNull();
    expect(loaded.coverage).toEqual({ complete: false, reason: 'state_corruption_detected' });
  });
});
