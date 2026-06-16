import { describe, expect, it } from 'vitest';
import { sanitizeInputForDiag, userSafeError } from '../src/diag.js';

describe('diag', () => {
  it('redacts secret-looking input fields recursively', () => {
    const tokenKey = ['telegram', 'Token'].join('');
    const hookKey = ['webhook', 'Url'].join('');
    const placeholder = 'dummy!';
    const sanitized = sanitizeInputForDiag({
      keywords: 'engineer',
      [tokenKey]: placeholder,
      nested: { [hookKey]: 'https://example.com/hook', normal: 'ok' },
    });
    expect(sanitized).toEqual({
      keywords: 'engineer',
      [tokenKey]: '[redacted:6c]',
      nested: { [hookKey]: '[redacted:24c]', normal: 'ok' },
    });
  });

  it('wraps internal causes in an opaque user-safe error', () => {
    const err = userSafeError(new Error('HTTP 500 with body'), 'LIN-2010');
    expect(err.message).toContain('[LIN-2010]');
    expect(err.message).not.toContain('HTTP 500');
    expect(err.code).toBe('LIN-2010');
  });
});
