import { describe, it, expect } from 'vitest';
import { parseDetail, extractSalaryFromText, detectWorkplaceTypeFromText } from '../src/detailParser.js';

describe('detectWorkplaceTypeFromText', () => {
  it('detects remote from free text / title', () => {
    expect(detectWorkplaceTypeFromText('Senior Engineer — Remote')).toBe('remote');
    expect(detectWorkplaceTypeFromText('This is a fully remote position')).toBe('remote');
    expect(detectWorkplaceTypeFromText('Backend Engineer (Remote)')).toBe('remote');
  });
  it('detects hybrid and prioritizes it over a co-mentioned remote', () => {
    expect(detectWorkplaceTypeFromText('Hybrid role')).toBe('hybrid');
    expect(detectWorkplaceTypeFromText('Hybrid - partially remote, 2 days onsite')).toBe('hybrid');
  });
  it('detects onsite', () => {
    expect(detectWorkplaceTypeFromText('On-site role in NYC')).toBe('onsite');
    expect(detectWorkplaceTypeFromText('This is an in-office position')).toBe('onsite');
  });
  it('ignores negated remote and returns null without other signal', () => {
    expect(detectWorkplaceTypeFromText('This role is not remote')).toBeNull();
    expect(detectWorkplaceTypeFromText('Great culture and benefits')).toBeNull();
    expect(detectWorkplaceTypeFromText(null)).toBeNull();
  });
});

describe('extractSalaryFromText', () => {
  it('parses an annual range with /yr', () => {
    expect(extractSalaryFromText('Base pay: $90,000.00/yr - $180,000.00/yr plus equity'))
      .toEqual({ min: 90000, max: 180000, currency: 'USD', period: 'YEAR' });
  });
  it('parses an hourly range', () => {
    expect(extractSalaryFromText('Pay range $45/hr - $60/hr'))
      .toEqual({ min: 45, max: 60, currency: 'USD', period: 'HOUR' });
  });
  it('parses a single annual value', () => {
    expect(extractSalaryFromText('Salary: $125,000/yr'))
      .toEqual({ min: 125000, max: null, currency: 'USD', period: 'YEAR' });
  });
  it('infers YEAR for K-suffixed ranges without a period token', () => {
    expect(extractSalaryFromText('$90K - $180K DOE'))
      .toEqual({ min: 90000, max: 180000, currency: 'USD', period: 'YEAR' });
  });
  it('returns null when no salary is present', () => {
    expect(extractSalaryFromText('Competitive salary and great benefits')).toBeNull();
    expect(extractSalaryFromText('a $5 gift card')).toBeNull();
  });
});

const SAMPLE = `
<html><body>
  <span class="posted-time-ago__text posted-time-ago__text--new topcard__flavor--metadata">
    9 hours ago
  </span>
  <figure class="num-applicants__figure topcard__flavor--metadata topcard__flavor--bullet">
    <figcaption class="num-applicants__caption">
      Over 200 applicants
    </figcaption>
  </figure>
  <div class="show-more-less-html__markup show-more-less-html__markup--clamp-after-5">
    <p>At Netflix, our mission is to entertain the world.</p>
    <ul><li>Build encoding pipelines.</li><li>Optimize streaming.</li></ul>
  </div>
  <button class="show-more-less-html__button">See more</button>
  <ul class="description__job-criteria-list">
    <li class="description__job-criteria-item">
      <h3 class="description__job-criteria-subheader">Seniority level</h3>
      <span class="description__job-criteria-text description__job-criteria-text--criteria">Mid-Senior level</span>
    </li>
    <li class="description__job-criteria-item">
      <h3 class="description__job-criteria-subheader">Employment type</h3>
      <span class="description__job-criteria-text description__job-criteria-text--criteria">Full-time</span>
    </li>
    <li class="description__job-criteria-item">
      <h3 class="description__job-criteria-subheader">Job function</h3>
      <span class="description__job-criteria-text description__job-criteria-text--criteria">Engineering and Information Technology</span>
    </li>
    <li class="description__job-criteria-item">
      <h3 class="description__job-criteria-subheader">Industries</h3>
      <span class="description__job-criteria-text description__job-criteria-text--criteria">Entertainment Providers</span>
    </li>
  </ul>
</body></html>
`;

describe('parseDetail', () => {
  it('extracts all common detail fields', () => {
    const d = parseDetail(SAMPLE);
    expect(d.description).toContain('At Netflix, our mission');
    expect(d.description).toContain('Build encoding pipelines.');
    expect(d.descriptionHtml).toContain('<p>');
    expect(d.seniorityLevel).toBe('Mid-Senior level');
    expect(d.employmentType).toBe('Full-time');
    expect(d.jobFunction).toBe('Engineering and Information Technology');
    expect(d.industry).toBe('Entertainment Providers');
    expect(d.applicantCount).toBe(200);
    expect(d.postedRelative).toBe('9 hours ago');
  });

  it('returns null fields gracefully when criteria absent', () => {
    const d = parseDetail('<html><body><div>no data</div></body></html>');
    expect(d.description).toBeNull();
    expect(d.descriptionHtml).toBeNull();
    expect(d.seniorityLevel).toBeNull();
    expect(d.employmentType).toBeNull();
    expect(d.industry).toBeNull();
    expect(d.applicantCount).toBeNull();
    expect(d.workplaceType).toBeNull();
  });

  it('parses applicant count from various phrasings', () => {
    const make = (caption: string) => `<figcaption class="num-applicants__caption">${caption}</figcaption>`;
    expect(parseDetail(make('Over 200 applicants')).applicantCount).toBe(200);
    expect(parseDetail(make('1,234 applicants')).applicantCount).toBe(1234);
    expect(parseDetail(make('Be among the first 25 applicants')).applicantCount).toBe(25);
  });

  it('detects remote workplace type from criteria text', () => {
    const html = `
      <ul class="description__job-criteria-list">
        <li class="description__job-criteria-item">
          <h3 class="description__job-criteria-subheader">Employment type</h3>
          <span class="description__job-criteria-text description__job-criteria-text--criteria">Remote, Full-time</span>
        </li>
      </ul>
    `;
    expect(parseDetail(html).workplaceType).toBe('remote');
  });

  it('detects hybrid workplace type', () => {
    const html = `
      <ul class="description__job-criteria-list">
        <li class="description__job-criteria-item">
          <h3 class="description__job-criteria-subheader">Workplace</h3>
          <span class="description__job-criteria-text description__job-criteria-text--criteria">Hybrid</span>
        </li>
      </ul>
    `;
    expect(parseDetail(html).workplaceType).toBe('hybrid');
  });

  it('falls back to description text for workplace type when criteria lack it', () => {
    const html = `<div class="show-more-less-html__markup"><p>This is a fully remote position based anywhere.</p></div><button class="show-more-less-html__button">See more</button>`;
    expect(parseDetail(html).workplaceType).toBe('remote');
  });

  it('decodes HTML entities in criteria values', () => {
    const html = `
      <ul class="description__job-criteria-list">
        <li class="description__job-criteria-item">
          <h3 class="description__job-criteria-subheader">Industries</h3>
          <span class="description__job-criteria-text description__job-criteria-text--criteria">Software &amp; Services</span>
        </li>
      </ul>
    `;
    expect(parseDetail(html).industry).toBe('Software & Services');
  });
});
