import { describe, expect, it } from 'vitest';
import { isCanaryRun, KNOWN_CANARY_ACTOR_IDS } from '../src/canaryActorIds.js';

describe('canaryActorIds', () => {
  it('recognizes the LinkedIn canary actor id explicitly', () => {
    expect(KNOWN_CANARY_ACTOR_IDS.has('GnI5iKVOtoFHcf4DF')).toBe(true);
    expect(isCanaryRun('GnI5iKVOtoFHcf4DF')).toBe(true);
  });

  it('does not match arbitrary actor ids', () => {
    expect(isCanaryRun('not-a-canary')).toBe(false);
  });
});
