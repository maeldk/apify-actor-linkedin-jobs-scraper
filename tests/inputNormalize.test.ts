import { describe, expect, it } from 'vitest';
import { cleanNumericList, cleanString, cleanStringList, cleanUpperList, normalizeInput, normalizeLinkedinHost } from '../src/inputNormalize.js';

describe('inputNormalize', () => {
  it('cleans strings and arrays consistently', () => {
    expect(cleanString('  senior   engineer  ')).toBe('senior engineer');
    expect(cleanStringList([' Acme  Inc ', 'Acme Inc', '', null])).toEqual(['Acme Inc']);
    expect(cleanUpperList([' dk ', 'se'])).toEqual(['DK', 'SE']);
    expect(cleanNumericList([' 123 ', 'abc', '123', '456'])).toEqual(['123', '456']);
  });

  it('normalizes actor search input', () => {
    const input = normalizeInput({
      keywords: '  senior   engineer  ',
      location: '  Copenhagen   Denmark ',
      geoIds: [' 123 ', 'abc', '123', '456'],
      regions: [' dk ', 'SE', ''],
      companies: [' 42 ', 'nope', '42', '7'],
      excludeCompanies: [' Acme  Inc ', 'Acme  Inc'],
      excludeKeywords: [' junior ', 'junior'],
      linkedinHost: 'HTTPS://DE.linkedin.com/jobs',
      startUrls: [{ url: ' https://www.linkedin.com/jobs/search/?keywords=foo  ' }, { url: 'https://www.linkedin.com/jobs/search/?keywords=foo' }],
    });
    expect(input.keywords).toBe('senior engineer');
    expect(input.location).toBe('Copenhagen Denmark');
    expect(input.geoIds).toEqual(['123', '456']);
    expect(input.regions).toEqual(['DK', 'SE']);
    expect(input.companies).toEqual(['42', '7']);
    expect(input.excludeCompanies).toEqual(['Acme Inc']);
    expect(input.excludeKeywords).toEqual(['junior']);
    expect(input.linkedinHost).toBe('de');
    expect(input.startUrls).toEqual(['https://www.linkedin.com/jobs/search/?keywords=foo']);
  });

  it('defaults excludeEmptyFields to true (clean output) but honours an explicit false', () => {
    expect(normalizeInput({ keywords: 'x' }).excludeEmptyFields).toBe(true);
    expect(normalizeInput({ keywords: 'x', excludeEmptyFields: false }).excludeEmptyFields).toBe(false);
    expect(normalizeInput({ keywords: 'x', excludeEmptyFields: true }).excludeEmptyFields).toBe(true);
  });

  it('normalizes LinkedIn hosts to the subdomain expected by apiClient', () => {
    expect(normalizeLinkedinHost('www')).toBe('www');
    expect(normalizeLinkedinHost('linkedin.com')).toBe('www');
    expect(normalizeLinkedinHost('https://de.linkedin.com/jobs/search')).toBe('de');
  });
});
