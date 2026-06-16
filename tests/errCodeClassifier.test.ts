import { describe, expect, it } from 'vitest';
import { classifyFallbackErrCode, type ErrCodeMap } from '../src/errCodeClassifier.js';

const codes: ErrCodeMap = {
  rateLimit: '2030',
  authBlock: '2030',
  http5xx: '2010',
  httpOther: '2010',
  parseError: '3001',
  networkTimeout: '2001',
  lockLost: '4001',
};

describe('classifyFallbackErrCode', () => {
  it('keeps non-catchall codes unchanged', () => {
    expect(classifyFallbackErrCode(new Error('anything'), 'LIN-3001', 'LIN', codes)).toBe('LIN-3001');
  });

  it('classifies catchall failures by cause text', () => {
    expect(classifyFallbackErrCode(new Error('LinkedIn search returned 503'), 'LIN-9000', 'LIN', codes)).toBe('LIN-2010');
    expect(classifyFallbackErrCode(new Error('state lock lost during run'), 'LIN-9000', 'LIN', codes)).toBe('LIN-4001');
  });
});
