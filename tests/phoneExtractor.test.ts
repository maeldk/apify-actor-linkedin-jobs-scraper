import { describe, expect, it } from 'vitest';
import { extractPhones } from '../src/phoneExtractor.js';

describe('extractPhones', () => {
  it('extracts international numbers in strict mode', () => {
    expect(extractPhones('Call +45 12 34 56 78')).toEqual(['+45 12 34 56 78']);
  });

  it('extracts prefixed local numbers in strict mode', () => {
    expect(extractPhones('Phone: 020 1234 5678')).toEqual(['020 1234 5678']);
  });

  it('requires lenient mode for bare local numbers', () => {
    expect(extractPhones('Office location code 020 1234 5678')).toEqual([]);
    expect(extractPhones('Office location code 020 1234 5678', { mode: 'lenient' })).toEqual(['020 1234 5678']);
  });

  it('filters common numeric noise', () => {
    expect(extractPhones('VAT DE123456789 and date 2026-05-13')).toEqual([]);
  });
});
