import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logRunFooter } from '../src/runFooter.js';

vi.mock('apify', () => ({
  log: {
    info: vi.fn(),
  },
}));

import { log } from 'apify';

describe('logRunFooter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emits footer with review and issue links when emitted >= 20', () => {
    logRunFooter({ actorSlug: 'blackfalcondata/test-scraper', emitted: 50 });

    const calls = (log.info as unknown as { mock: { calls: unknown[][] } }).mock.calls.map(c => c[0]);
    const text = calls.join('\n');
    expect(text).toMatch(/50.*(?:listings|jobs)/);
    expect(text).toContain('https://apify.com/blackfalcondata/test-scraper/reviews');
    expect(text).toContain('https://apify.com/blackfalcondata/test-scraper/issues');
    expect(text).not.toContain('fpr=');
  });

  it('skips when emitted < 20 (canary/test runs)', () => {
    logRunFooter({ actorSlug: 'blackfalcondata/test-scraper', emitted: 10 });
    expect(log.info).not.toHaveBeenCalled();
  });

  it('skips when emitted = 0', () => {
    logRunFooter({ actorSlug: 'blackfalcondata/test-scraper', emitted: 0 });
    expect(log.info).not.toHaveBeenCalled();
  });

  it('emits when emitted equals threshold (20)', () => {
    logRunFooter({ actorSlug: 'blackfalcondata/test-scraper', emitted: 20 });
    expect(log.info).toHaveBeenCalled();
  });

  it('respects custom minThreshold', () => {
    logRunFooter({ actorSlug: 'blackfalcondata/test-scraper', emitted: 5, minThreshold: 1 });
    expect(log.info).toHaveBeenCalled();
  });

  it('uses correct actor slug in URLs', () => {
    logRunFooter({ actorSlug: 'foo/bar-baz', emitted: 25 });
    const calls = (log.info as unknown as { mock: { calls: unknown[][] } }).mock.calls.map(c => c[0]);
    const text = calls.join('\n');
    expect(text).toContain('https://apify.com/foo/bar-baz/reviews');
    expect(text).toContain('https://apify.com/foo/bar-baz/issues');
  });
});
