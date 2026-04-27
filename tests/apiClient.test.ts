import { describe, it, expect } from 'vitest';
import { buildSearchUrl, parseSearchCards, fetchRelatedJobs } from '../src/apiClient.js';

describe('buildSearchUrl', () => {
  it('builds canonical SERP URL with required params', () => {
    const url = buildSearchUrl({ keywords: 'software engineer' }, 0);
    expect(url).toContain('linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search');
    expect(url).toContain('keywords=software+engineer');
    expect(url).toContain('start=0');
    expect(url).toContain('sortBy=DD');  // recent (default)
  });

  it('encodes start offset', () => {
    expect(buildSearchUrl({}, 50)).toContain('start=50');
    expect(buildSearchUrl({}, 990)).toContain('start=990');
  });

  it('uses sortBy=R for relevant', () => {
    const url = buildSearchUrl({ sortBy: 'relevant' }, 0);
    expect(url).toContain('sortBy=R');
    expect(url).not.toContain('sortBy=DD');
  });

  it('maps datePosted enum to f_TPR', () => {
    expect(buildSearchUrl({ datePosted: 'lastHour' }, 0)).toContain('f_TPR=r3600');
    expect(buildSearchUrl({ datePosted: 'last24h' }, 0)).toContain('f_TPR=r86400');
    expect(buildSearchUrl({ datePosted: 'last7d' }, 0)).toContain('f_TPR=r604800');
    expect(buildSearchUrl({ datePosted: 'last30d' }, 0)).toContain('f_TPR=r2592000');
  });

  it('omits f_TPR when datePosted=anytime', () => {
    expect(buildSearchUrl({ datePosted: 'anytime' }, 0)).not.toContain('f_TPR');
  });

  it('maps workType to f_WT codes', () => {
    expect(buildSearchUrl({ workType: ['onsite'] }, 0)).toContain('f_WT=1');
    expect(buildSearchUrl({ workType: ['remote'] }, 0)).toContain('f_WT=2');
    expect(buildSearchUrl({ workType: ['hybrid'] }, 0)).toContain('f_WT=3');
  });

  it('joins multi-select workType with comma (URL-encoded as %2C)', () => {
    const url = buildSearchUrl({ workType: ['remote', 'hybrid'] }, 0);
    expect(url).toMatch(/f_WT=2(?:,|%2C)3/);
  });

  it('maps experienceLevel to f_E codes', () => {
    expect(buildSearchUrl({ experienceLevel: ['internship'] }, 0)).toContain('f_E=1');
    expect(buildSearchUrl({ experienceLevel: ['mid_senior'] }, 0)).toContain('f_E=4');
    expect(buildSearchUrl({ experienceLevel: ['executive'] }, 0)).toContain('f_E=6');
  });

  it('maps jobType to f_JT letter codes', () => {
    expect(buildSearchUrl({ jobType: ['fulltime'] }, 0)).toContain('f_JT=F');
    expect(buildSearchUrl({ jobType: ['contract'] }, 0)).toContain('f_JT=C');
    expect(buildSearchUrl({ jobType: ['internship'] }, 0)).toContain('f_JT=I');
  });

  it('joins companies on f_C', () => {
    const url = buildSearchUrl({ companies: ['1234', '5678'] }, 0);
    expect(url).toMatch(/f_C=1234(?:,|%2C)5678/);
  });

  it('maps salaryMin to f_SB2 bucket index', () => {
    // Bucket thresholds: 40k, 60k, 80k, 100k, 120k, 140k, 160k
    expect(buildSearchUrl({ salaryMin: 50000 }, 0)).toContain('f_SB2=1');   // ≥40k
    expect(buildSearchUrl({ salaryMin: 100000 }, 0)).toContain('f_SB2=4');  // ≥100k
    expect(buildSearchUrl({ salaryMin: 200000 }, 0)).toContain('f_SB2=7');  // ≥160k
  });

  it('omits f_SB2 when salaryMin is below first bucket', () => {
    expect(buildSearchUrl({ salaryMin: 30000 }, 0)).not.toContain('f_SB2');
  });

  it('sets f_AL=true when easyApply', () => {
    expect(buildSearchUrl({ easyApply: true }, 0)).toContain('f_AL=true');
    expect(buildSearchUrl({ easyApply: false }, 0)).not.toContain('f_AL');
  });

  it('honors linkedinHost', () => {
    expect(buildSearchUrl({ linkedinHost: 'de' }, 0)).toContain('https://de.linkedin.com/');
    expect(buildSearchUrl({ linkedinHost: 'www' }, 0)).toContain('https://www.linkedin.com/');
  });

  it('passes geoId, location, distance', () => {
    const url = buildSearchUrl({ geoId: '103644278', location: 'United States', distance: 25 }, 0);
    expect(url).toContain('geoId=103644278');
    expect(url).toContain('location=United+States');
    expect(url).toContain('distance=25');
  });
});

describe('parseSearchCards', () => {
  const SAMPLE_CARD = `
    <li>
      <div class="base-card relative" data-entity-urn="urn:li:jobPosting:4391930855" data-tracking-id="abc123==">
        <a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/software-engineer-at-pariveda-4391930855?refId=xyz">
          <h3 class="base-search-card__title">Software Engineer</h3>
          <h4 class="base-search-card__subtitle">
            <a href="https://www.linkedin.com/company/pariveda?trk=guest_job_search">Pariveda</a>
          </h4>
          <span class="job-search-card__location">Philadelphia, PA</span>
          <time datetime="2026-04-25">3 days ago</time>
          <span class="job-posting-benefits__text">Be an early applicant</span>
        </a>
      </div>
    </li>
  `;

  it('extracts a single card with all key fields', () => {
    const cards = parseSearchCards(SAMPLE_CARD);
    expect(cards).toHaveLength(1);
    const c = cards[0];
    expect(c.jobId).toBe('4391930855');
    expect(c.urn).toBe('urn:li:jobPosting:4391930855');
    expect(c.title).toBe('Software Engineer');
    expect(c.company).toBe('Pariveda');
    expect(c.companyUrl).toBe('https://www.linkedin.com/company/pariveda');  // tracking stripped
    expect(c.location).toBe('Philadelphia, PA');
    expect(c.postedAtIso).toBe('2026-04-25');
    expect(c.jobUrl).toBe('https://www.linkedin.com/jobs/view/software-engineer-at-pariveda-4391930855');
    expect(c.trackingId).toBe('abc123==');
    expect(c.postingBenefits).toEqual(['Be an early applicant']);
    expect(c.isPromoted).toBe(false);
    expect(c.isEasyApplyOnCard).toBe(false);
  });

  it('flags Easy Apply cards', () => {
    const html = SAMPLE_CARD.replace('Be an early applicant', 'Easy Apply');
    const cards = parseSearchCards(html);
    expect(cards[0].isEasyApplyOnCard).toBe(true);
  });

  it('flags promoted cards', () => {
    const html = SAMPLE_CARD.replace('Be an early applicant', 'Promoted');
    const cards = parseSearchCards(html);
    expect(cards[0].isPromoted).toBe(true);
  });

  it('returns empty array on empty input', () => {
    expect(parseSearchCards('')).toEqual([]);
    expect(parseSearchCards('<html><body></body></html>')).toEqual([]);
  });

  it('extracts multiple cards from a multi-card SERP fragment', () => {
    const html = SAMPLE_CARD + SAMPLE_CARD.replace('4391930855', '4400000001').replace('Pariveda', 'Acme');
    const cards = parseSearchCards(html);
    expect(cards).toHaveLength(2);
    expect(cards[0].jobId).toBe('4391930855');
    expect(cards[1].jobId).toBe('4400000001');
    expect(cards[1].company).toBe('Acme');
  });

  it('decodes HTML entities in title and company', () => {
    const html = SAMPLE_CARD
      .replace('Software Engineer', 'AT&amp;T Engineer')
      .replace('Pariveda', 'Smith &amp; Co');
    const cards = parseSearchCards(html);
    expect(cards[0].title).toBe('AT&T Engineer');
    expect(cards[0].company).toBe('Smith & Co');
  });
});

describe('fetchRelatedJobs', () => {
  it('hits the relatedJobs endpoint with currentJobId', async () => {
    let captured: string | null = null;
    const fakeFetch: typeof globalThis.fetch = (async (url: string) => {
      captured = url;
      return { ok: true, status: 200, text: async () => '<html></html>' } as Response;
    }) as unknown as typeof globalThis.fetch;
    const result = await fetchRelatedJobs('1234', { fetchFn: fakeFetch });
    expect(result).toEqual([]);
    expect(captured).toContain('/jobs-guest/jobs/api/seeMoreJobPostings/relatedJobs?currentJobId=1234');
  });

  it('returns empty on non-ok response', async () => {
    const fakeFetch: typeof globalThis.fetch = (async () =>
      ({ ok: false, status: 404, text: async () => '' } as Response)) as unknown as typeof globalThis.fetch;
    expect(await fetchRelatedJobs('1234', { fetchFn: fakeFetch })).toEqual([]);
  });

  it('parses cards from related-feed HTML using same parser as SERP', async () => {
    const sampleCard = `<li><div data-entity-urn="urn:li:jobPosting:7777"><h3 class="base-search-card__title">Related Role</h3><span class="job-search-card__location">Remote</span></div></li>`;
    const fakeFetch: typeof globalThis.fetch = (async () =>
      ({ ok: true, status: 200, text: async () => sampleCard } as Response)) as unknown as typeof globalThis.fetch;
    const result = await fetchRelatedJobs('seed', { fetchFn: fakeFetch });
    expect(result).toHaveLength(1);
    expect(result[0].jobId).toBe('7777');
    expect(result[0].title).toBe('Related Role');
  });

  it('uses linkedinHost option to override subdomain', async () => {
    let captured: string | null = null;
    const fakeFetch: typeof globalThis.fetch = (async (url: string) => {
      captured = url;
      return { ok: true, status: 200, text: async () => '' } as Response;
    }) as unknown as typeof globalThis.fetch;
    await fetchRelatedJobs('1234', { fetchFn: fakeFetch, linkedinHost: 'de' });
    expect(captured).toContain('https://de.linkedin.com/');
  });
});
