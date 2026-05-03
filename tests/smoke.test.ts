import { describe, it, expect } from 'vitest';
import { DEFAULTS, COMPACT_FIELDS, SOURCE_NAME, REGION_PRESETS, AGENCY_KEYWORDS, URL_TRACKING_PARAMS } from '../src/constants.js';
import { transformJob, buildContentHash } from '../src/transform.js';
import type { ApiJob } from '../src/apiClient.js';
import { classifyJob, detectRepostMatch, buildUpdatedState, findExpiredJobs } from '../src/incrementalState.js';
import type { IncrementalState, ClassifiedRecord, JobStateEntry } from '../src/incrementalState.js';
import { selectItemsToNotify } from '../src/notifications.js';
import type { OutputItem } from '../src/types.js';

const MOCK_API_JOB: ApiJob = {
  jobId: '4391930855',
  urn: 'urn:li:jobPosting:4391930855',
  title: 'Senior Software Engineer',
  company: 'Acme Corp',
  companyUrl: 'https://www.linkedin.com/company/acme',
  location: 'Copenhagen, Capital Region of Denmark, Denmark',
  postedAtIso: '2026-04-20',
  jobUrl: 'https://www.linkedin.com/jobs/view/4391930855',
  trackingId: 'abc==',
  isPromoted: false,
  isEasyApplyOnCard: false,
  postingBenefits: ['Be an early applicant'],
};

describe('constants', () => {
  it('DEFAULTS sane', () => {
    expect(DEFAULTS.maxResults).toBe(100);
    expect(DEFAULTS.pageSize).toBe(10);
    expect(DEFAULTS.paginationHardCap).toBe(1000);
    expect(DEFAULTS.pricePerResult).toBe(0.001);
  });

  it('COMPACT_FIELDS includes core LinkedIn fields', () => {
    expect(COMPACT_FIELDS).toBeInstanceOf(Set);
    expect(COMPACT_FIELDS.has('jobId')).toBe(true);
    expect(COMPACT_FIELDS.has('linkedinJobId')).toBe(true);
    expect(COMPACT_FIELDS.has('title')).toBe(true);
    expect(COMPACT_FIELDS.has('changeType')).toBe(true);
  });

  it('SOURCE_NAME is linkedin.com', () => {
    expect(SOURCE_NAME).toBe('linkedin.com');
  });

  it('REGION_PRESETS cover the 11 documented groups', () => {
    expect(Object.keys(REGION_PRESETS)).toHaveLength(11);
    expect(REGION_PRESETS.nordic).toContain('DK');
    expect(REGION_PRESETS.dach).toEqual(['DE', 'AT', 'CH']);
    expect(REGION_PRESETS['eu-27']).toHaveLength(27);
  });

  it('AGENCY_KEYWORDS includes English + Nordic + German terms', () => {
    expect(AGENCY_KEYWORDS).toContain('recruitment');
    expect(AGENCY_KEYWORDS).toContain('staffing');
    expect(AGENCY_KEYWORDS).toContain('rekruttering');
    expect(AGENCY_KEYWORDS).toContain('personalvermittlung');
  });

  it('URL_TRACKING_PARAMS covers LinkedIn + UTM', () => {
    expect(URL_TRACKING_PARAMS.has('refId')).toBe(true);
    expect(URL_TRACKING_PARAMS.has('trk')).toBe(true);
    expect(URL_TRACKING_PARAMS.has('utm_source')).toBe(true);
  });
});

describe('transformJob', () => {
  const scrapedAt = '2026-04-26T12:00:00.000Z';

  it('maps all card fields onto OutputItem', () => {
    const item = transformJob(MOCK_API_JOB, scrapedAt);
    expect(item.jobId).toMatch(/^[a-f0-9]{64}$/);
    expect(item.linkedinJobId).toBe('4391930855');
    expect(item.title).toBe('Senior Software Engineer');
    expect(item.company).toBe('Acme Corp');
    expect(item.companyUrl).toBe('https://www.linkedin.com/company/acme');
    expect(item.companyId).toBe('acme');
    expect(item.location).toBe('Copenhagen, Capital Region of Denmark, Denmark');
    expect(item.country).toBe('Denmark');  // last comma-segment passthrough
    expect(item.postedAt).toBe('2026-04-20T00:00:00.000Z');
    expect(item.jobUrl).toBe('https://www.linkedin.com/jobs/view/4391930855');
    expect(item.applyUrl).toBe('https://www.linkedin.com/jobs/view/4391930855');
    expect(item.applyType).toBe('unknown');
    expect(item.isPromoted).toBe(false);
    expect(item.postingBenefits).toEqual(['Be an early applicant']);
    expect(item.trackingId).toBe('abc==');
    expect(item.source).toBe('linkedin');
    expect(item.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('detail fields are null pre-enrichment', () => {
    const item = transformJob(MOCK_API_JOB, scrapedAt);
    expect(item.description).toBeNull();
    expect(item.descriptionMarkdown).toBeNull();
    expect(item.applicantCount).toBeNull();
    expect(item.salaryMin).toBeNull();
    expect(item.companyEmployeeCount).toBeNull();
    expect(item.recruiterName).toBeNull();
  });

  it('marks Easy Apply cards as applyType=onsite', () => {
    const item = transformJob({ ...MOCK_API_JOB, isEasyApplyOnCard: true }, scrapedAt);
    expect(item.applyType).toBe('onsite');
    expect(item.easyApply).toBe(true);
  });

  it('jobId and contentHash are deterministic across scrapedAt', () => {
    const a = transformJob(MOCK_API_JOB, '2026-04-26T00:00:00.000Z');
    const b = transformJob(MOCK_API_JOB, '2026-04-27T00:00:00.000Z');
    expect(a.jobId).toBe(b.jobId);
    expect(a.contentHash).toBe(b.contentHash);
  });

  it('contentHash differs when title changes', () => {
    const a = transformJob(MOCK_API_JOB, scrapedAt);
    const b = transformJob({ ...MOCK_API_JOB, title: 'Junior Developer' }, scrapedAt);
    expect(a.contentHash).not.toBe(b.contentHash);
  });

  it('handles null fields gracefully', () => {
    const sparse: ApiJob = {
      jobId: '999',
      urn: 'urn:li:jobPosting:999',
      title: null, company: null, companyUrl: null,
      location: null, postedAtIso: null, jobUrl: null, trackingId: null,
      isPromoted: false, isEasyApplyOnCard: false, postingBenefits: null,
    };
    const item = transformJob(sparse, scrapedAt);
    expect(item.title).toBeNull();
    expect(item.country).toBeNull();
    expect(item.postedAt).toBeNull();
    expect(item.companyId).toBeNull();
  });

  it('returns null postedAt for malformed datetime', () => {
    const item = transformJob({ ...MOCK_API_JOB, postedAtIso: 'not-a-date' }, scrapedAt);
    expect(item.postedAt).toBeNull();
  });
});

describe('buildContentHash', () => {
  it('returns 64-char SHA-256', () => {
    const h = buildContentHash({ title: 'Dev', company: 'Acme', location: 'Copenhagen', postedAt: '2026-04-20' });
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic', () => {
    const f = { title: 'Dev', company: 'Acme', location: 'Copenhagen', postedAt: '2026-04-20' };
    expect(buildContentHash(f)).toBe(buildContentHash(f));
  });

  it('handles all-null fields', () => {
    expect(buildContentHash({ title: null, company: null, location: null, postedAt: null })).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes when any field changes', () => {
    const base = { title: 'Dev', company: 'Acme', location: 'Copenhagen', postedAt: '2026-04-20' };
    const baseHash = buildContentHash(base);
    expect(buildContentHash({ ...base, title: 'Mgr' })).not.toBe(baseHash);
    expect(buildContentHash({ ...base, company: 'Beta' })).not.toBe(baseHash);
    expect(buildContentHash({ ...base, location: 'Berlin' })).not.toBe(baseHash);
    expect(buildContentHash({ ...base, postedAt: '2026-04-21' })).not.toBe(baseHash);
  });
});

describe('incrementalState - classifyJob', () => {
  const NOW = '2026-04-26T00:00:00.000Z';
  const HASH = 'abc123';
  const CONTENT_HASH = 'contenthash1';

  const makeState = (overrides: Partial<{ active: boolean; trackedHash: string }>): IncrementalState => ({
    version: 1, stateKey: 'k', updatedAt: NOW,
    jobs: { 'job-1': {
      jobId: 'job-1', contentHash: CONTENT_HASH,
      trackedHash: overrides.trackedHash ?? HASH,
      firstSeenAt: NOW, lastSeenAt: NOW,
      active: overrides.active ?? true,
      expiredAt: overrides.active === false ? NOW : null,
    } },
  });

  it('NEW when no prior state', () => {
    expect(classifyJob('job-1', CONTENT_HASH, HASH, NOW, null).changeType).toBe('NEW');
  });

  it('UNCHANGED when hash matches', () => {
    expect(classifyJob('job-1', CONTENT_HASH, HASH, NOW, makeState({})).changeType).toBe('UNCHANGED');
  });

  it('UPDATED when tracked hash differs', () => {
    expect(classifyJob('job-1', CONTENT_HASH, HASH, NOW, makeState({ trackedHash: 'oldhash' })).changeType).toBe('UPDATED');
  });

  it('REAPPEARED for inactive job', () => {
    expect(classifyJob('job-1', CONTENT_HASH, HASH, NOW, makeState({ active: false })).changeType).toBe('REAPPEARED');
  });
});

describe('incrementalState - detectRepostMatch', () => {
  const NOW = '2026-04-26T00:00:00.000Z';
  const CONTENT_HASH = 'contenthash1';

  const makeState = (active: boolean): IncrementalState => ({
    version: 1, stateKey: 'k', updatedAt: NOW,
    jobs: { 'job-1': {
      jobId: 'job-1', contentHash: CONTENT_HASH, trackedHash: 'h',
      firstSeenAt: NOW, lastSeenAt: NOW, active,
      expiredAt: active ? null : NOW,
    } },
  });

  it('null when no prior state', () => {
    expect(detectRepostMatch('job-2', CONTENT_HASH, null)).toBeNull();
  });

  it('detects repost from inactive job sharing content hash', () => {
    const m = detectRepostMatch('job-2', CONTENT_HASH, makeState(false));
    expect(m?.jobId).toBe('job-1');
  });

  it('null when prior is still active (it is the same listing)', () => {
    expect(detectRepostMatch('job-2', CONTENT_HASH, makeState(true))).toBeNull();
  });
});

describe('incrementalState - snapshot lifecycle', () => {
  const T1 = '2026-04-26T00:00:00.000Z';
  const T2 = '2026-04-27T00:00:00.000Z';

  it('buildUpdatedState persists snapshot for active jobs', () => {
    const classifications: ClassifiedRecord[] = [
      { jobId: 'j1', changeType: 'NEW', contentHash: 'h1', trackedHash: 't1', firstSeenAt: T1, lastSeenAt: T1, previousSeenAt: null, expiredAt: null },
    ];
    const snaps = new Map<string, NonNullable<JobStateEntry['snapshot']>>();
    snaps.set('j1', { linkedinJobId: '4391', title: 'Engineer', company: 'Acme', location: 'NYC', jobUrl: 'https://example/1', postedAt: T1 });
    const state = buildUpdatedState('k', T1, null, classifications, snaps);
    expect(state.jobs.j1.snapshot?.title).toBe('Engineer');
    expect(state.jobs.j1.snapshot?.company).toBe('Acme');
    expect(state.jobs.j1.snapshot?.linkedinJobId).toBe('4391');
  });

  it('snapshot survives EXPIRED transition (so EXPIRED stub can be re-emitted)', () => {
    // T1: job j1 is active with snapshot
    const initial: ClassifiedRecord[] = [
      { jobId: 'j1', changeType: 'NEW', contentHash: 'h1', trackedHash: 't1', firstSeenAt: T1, lastSeenAt: T1, previousSeenAt: null, expiredAt: null },
    ];
    const snaps = new Map<string, NonNullable<JobStateEntry['snapshot']>>();
    snaps.set('j1', { linkedinJobId: '4391', title: 'Engineer', company: 'Acme', location: 'NYC', jobUrl: null, postedAt: T1 });
    const state1 = buildUpdatedState('k', T1, null, initial, snaps);
    expect(state1.jobs.j1.active).toBe(true);

    // T2: j1 disappears → findExpiredJobs marks it EXPIRED
    const expired = findExpiredJobs(new Set(), T2, state1);
    expect(expired).toHaveLength(1);
    expect(expired[0].changeType).toBe('EXPIRED');

    // buildUpdatedState should preserve snapshot on existing jobs even when no new classifications carry it
    const state2 = buildUpdatedState('k', T2, state1, expired);
    expect(state2.jobs.j1.active).toBe(false);
    expect(state2.jobs.j1.snapshot?.title).toBe('Engineer');  // ← key check
    expect(state2.jobs.j1.snapshot?.company).toBe('Acme');
  });

  it('REAPPEARED inherits the snapshot from the most recent visit (or override)', () => {
    const classifications: ClassifiedRecord[] = [
      { jobId: 'j1', changeType: 'NEW', contentHash: 'h1', trackedHash: 't1', firstSeenAt: T1, lastSeenAt: T1, previousSeenAt: null, expiredAt: null },
    ];
    const snaps1 = new Map<string, NonNullable<JobStateEntry['snapshot']>>();
    snaps1.set('j1', { title: 'Old Title', company: 'Acme', location: null, jobUrl: null, postedAt: T1, linkedinJobId: 'x' });
    const state1 = buildUpdatedState('k', T1, null, classifications, snaps1);

    // Job goes EXPIRED then REAPPEARED with updated title
    const reappear: ClassifiedRecord[] = [
      { jobId: 'j1', changeType: 'REAPPEARED', contentHash: 'h2', trackedHash: 't2', firstSeenAt: T1, lastSeenAt: T2, previousSeenAt: T1, expiredAt: null },
    ];
    const snaps2 = new Map<string, NonNullable<JobStateEntry['snapshot']>>();
    snaps2.set('j1', { title: 'New Title', company: 'Acme', location: null, jobUrl: null, postedAt: T2, linkedinJobId: 'x' });
    const state2 = buildUpdatedState('k', T2, state1, reappear, snaps2);
    expect(state2.jobs.j1.snapshot?.title).toBe('New Title');
    expect(state2.jobs.j1.active).toBe(true);
  });
});

describe('descriptionMaxLength truncation', () => {
  // Mirrors the truncation logic in main.ts:
  //   if (descriptionMaxLength > 0 && item.description.length > descriptionMaxLength)
  //     item.description = item.description.slice(0, descriptionMaxLength);
  function applyTruncation(description: string | null, max: number): string | null {
    if (!description) return description;
    if (max > 0 && description.length > max) return description.slice(0, max);
    return description;
  }

  it('truncates description longer than max', () => {
    expect(applyTruncation('x'.repeat(500), 100)?.length).toBe(100);
  });

  it('does not touch description shorter than max', () => {
    expect(applyTruncation('short', 100)).toBe('short');
  });

  it('zero max disables truncation', () => {
    expect(applyTruncation('x'.repeat(500), 0)?.length).toBe(500);
  });

  it('null description survives untouched', () => {
    expect(applyTruncation(null, 100)).toBeNull();
  });
});

describe('selectItemsToNotify', () => {
  const baseItem = (changeType: OutputItem['changeType']): OutputItem => ({
    jobId: 'a'.repeat(64), linkedinJobId: '1', jobUrl: null, title: 't', company: null, companyUrl: null,
    companyId: null, location: null, country: null, postedAt: null, applyUrl: null, applyType: null,
    description: null, descriptionHtml: null, descriptionMarkdown: null,
    seniorityLevel: null, employmentType: null, industry: null, jobFunction: null,
    workplaceType: null, applicantCount: null, easyApply: null,
    salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null, salarySource: null, salaryIsPredicted: null,
    companyLogo: null, companyDescription: null, companyEmployeeCount: null, companyWebsite: null, companyAddress: null,
    recruiterName: null, recruiterUrl: null, recruiterTitle: null,
    contactEmail: null, contactPhone: null,
    companyLinkedIn: null, companySocialLinks: null,
    applyEmail: null,
    extractedEmails: [], extractedPhones: [], extractedUrls: [],
    socialProfiles: { linkedin: [], twitter: [], instagram: [], facebook: [], youtube: [], tiktok: [], github: [], xing: [] },
    changeType, firstSeenAt: null, lastSeenAt: null, previousSeenAt: null, expiredAt: null,
    isRepost: null, repostOfId: null, repostDetectedAt: null,
    scrapedAt: '2026-04-26T00:00:00.000Z', source: 'linkedin', language: null, contentHash: 'b'.repeat(64),
    isPromoted: null, postingBenefits: null, trackingId: null,
  });

  it('returns all items when notifyOnlyChanges=false', () => {
    const items = [baseItem('NEW'), baseItem('UNCHANGED'), baseItem('UPDATED')];
    expect(selectItemsToNotify(items, false, true)).toHaveLength(3);
  });

  it('filters to NEW+UPDATED when notifyOnlyChanges=true and incrementalMode=true', () => {
    const items = [baseItem('NEW'), baseItem('UNCHANGED'), baseItem('UPDATED')];
    const r = selectItemsToNotify(items, true, true);
    expect(r).toHaveLength(2);
    expect(r.every((i) => i.changeType === 'NEW' || i.changeType === 'UPDATED')).toBe(true);
  });

  it('ignores notifyOnlyChanges when not in incrementalMode', () => {
    const items = [baseItem(null), baseItem(null)];
    expect(selectItemsToNotify(items, true, false)).toHaveLength(2);
  });
});
