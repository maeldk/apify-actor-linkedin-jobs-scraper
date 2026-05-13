import { describe, expect, it } from 'vitest';
import { formatDiscord, formatSlack, formatTelegram, formatWhatsApp, selectItemsToNotify } from '../src/notifications.js';
import type { OutputItem } from '../src/types.js';

function item(changeType: OutputItem['changeType'], title = 'Senior Engineer'): OutputItem {
  return {
    jobId: 'a'.repeat(64), linkedinJobId: '1', jobUrl: 'https://www.linkedin.com/jobs/view/1', title, company: 'Acme', companyUrl: null,
    companyId: null, location: 'Copenhagen, DK', country: 'DK', postedAt: null, applyUrl: null, applyType: null,
    description: null, descriptionHtml: null, descriptionMarkdown: null,
    seniorityLevel: null, employmentType: null, industry: null, jobFunction: null,
    workplaceType: null, applicantCount: null, easyApply: null,
    salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null, salarySource: null, salaryIsPredicted: null,
    companyLogo: null, companyDescription: null, companyEmployeeCount: null, companyWebsite: null, companyAddress: null,
    contactName: null, recruiterName: null, recruiterUrl: null, recruiterTitle: null,
    contactEmail: null, contactPhone: null,
    companyLinkedIn: null, companySocialLinks: null,
    applyEmail: null,
    extractedEmails: [], extractedPhones: [], extractedUrls: [],
    socialProfiles: { linkedin: [], twitter: [], instagram: [], facebook: [], youtube: [], tiktok: [], github: [], xing: [] },
    changeType, firstSeenAt: null, lastSeenAt: null, previousSeenAt: null, expiredAt: null,
    isRepost: null, repostOfId: null, repostDetectedAt: null,
    scrapedAt: '2026-04-26T00:00:00.000Z', source: 'linkedin', language: null, contentHash: 'b'.repeat(64),
    isPromoted: null, postingBenefits: null, trackingId: null,
  };
}

describe('notifications', () => {
  it('filters notification items to changes in incremental mode', () => {
    const items = [item('NEW'), item('UNCHANGED'), item('UPDATED')];
    expect(selectItemsToNotify(items, true, true).map((x) => x.changeType)).toEqual(['NEW', 'UPDATED']);
    expect(selectItemsToNotify(items, true, false)).toHaveLength(3);
  });

  it('formats messages for supported text platforms', () => {
    const items = [item('NEW')];
    const metadata = { searchLabel: 'LinkedIn: engineer', totalEmitted: 1, runAt: '2026-04-26T00:00:00.000Z' };
    expect(formatTelegram(items, metadata)).toContain('Senior Engineer');
    expect(formatWhatsApp(items, metadata)).toContain('Senior Engineer');
    expect(formatDiscord(items, metadata).embeds[0].title).toContain('Senior Engineer');
    expect(formatSlack(items, metadata).blocks.length).toBeGreaterThan(0);
  });
});
