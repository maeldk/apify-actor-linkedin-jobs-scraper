import { describe, expect, it } from 'vitest';
import { parseCompanyJsonLd, parseSearchCards } from '../src/apiClient.js';
import { parseDetail } from '../src/detailParser.js';
import { createSchemaWatcher } from '../src/schemaDrift.js';
import {
  DRIFT_ACK,
  DRIFT_MAPPED,
  observeApiJob,
  observeCompanyInfo,
  observeDetail,
} from '../src/schemaDriftConfig.js';

const searchCardHtml = `
  <li>
    <div class="base-card relative" data-entity-urn="urn:li:jobPosting:4391930855" data-tracking-id="abc123==">
      <a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/software-engineer-at-pariveda-4391930855?refId=xyz">
        <h3 class="base-search-card__title">Software Engineer</h3>
        <h4 class="base-search-card__subtitle">
          <a href="https://www.linkedin.com/company/pariveda?trk=guest_job_search">Pariveda</a>
        </h4>
        <span class="job-search-card__location">Philadelphia, PA</span>
        <time datetime="2026-04-25">3 days ago</time>
        <span class="job-posting-benefits__text">Easy Apply</span>
      </a>
    </div>
  </li>
`;

const detailHtml = `
  <span class="posted-time-ago__text">9 hours ago</span>
  <figure><figcaption class="num-applicants__caption">Over 200 applicants</figcaption></figure>
  <div class="show-more-less-html__markup">
    <p>Build encoding pipelines. Salary range $90,000/yr - $180,000/yr.</p>
  </div>
  <button>See more</button>
  <ul>
    <li class="description__job-criteria-item">
      <h3 class="description__job-criteria-subheader">Seniority level</h3>
      <span class="description__job-criteria-text">Mid-Senior level</span>
    </li>
    <li class="description__job-criteria-item">
      <h3 class="description__job-criteria-subheader">Employment type</h3>
      <span class="description__job-criteria-text">Remote, Full-time</span>
    </li>
    <li class="description__job-criteria-item">
      <h3 class="description__job-criteria-subheader">Job function</h3>
      <span class="description__job-criteria-text">Engineering</span>
    </li>
    <li class="description__job-criteria-item">
      <h3 class="description__job-criteria-subheader">Industries</h3>
      <span class="description__job-criteria-text">Software &amp; Services</span>
    </li>
  </ul>
`;

const companyHtml = `
  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "SMSI Group",
      "description": "Facility solutions",
      "sameAs": "https://www.smsi.group",
      "numberOfEmployees": { "value": 80, "@type": "QuantitativeValue" },
      "logo": { "contentUrl": "https://media.licdn.com/logo", "@type": "ImageObject" },
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "2960 N Eastgate Ave",
        "addressLocality": "Springfield",
        "addressRegion": "Missouri",
        "postalCode": "65803",
        "addressCountry": "US"
      }
    }
  </script>
`;

describe('schemaDrift v2.0.1 config', () => {
  it('treats mapped LinkedIn fixture fields as known', () => {
    const watcher = createSchemaWatcher({
      actor: 'linkedin-jobs-scraper',
      mappedKnown: DRIFT_MAPPED,
      acknowledgedIgnored: DRIFT_ACK,
      now: () => '2026-06-16T00:00:00.000Z',
    });
    const observe = (layer: string, record: unknown) => watcher.observe(layer, record);

    const jobs = parseSearchCards(searchCardHtml);
    const detail = parseDetail(detailHtml);
    const company = parseCompanyJsonLd(companyHtml);

    observeApiJob(jobs, observe);
    observeDetail(detail, observe);
    observeCompanyInfo(company, observe);

    const report = watcher.report();
    expect(report.pendingDrift).toEqual({});
    expect(report.observedBaseline.moduleVersion).toBe('2.0.1');
    expect(report.sampled.apiJob).toBe(jobs.length);
    expect(report.sampled.detail).toBe(1);
    expect(report.sampled.companyInfo).toBe(1);
  });

  it('reports a new LinkedIn source field as pending drift', () => {
    const watcher = createSchemaWatcher({
      actor: 'linkedin-jobs-scraper',
      mappedKnown: DRIFT_MAPPED,
      acknowledgedIgnored: DRIFT_ACK,
      now: () => '2026-06-16T00:00:00.000Z',
    });

    watcher.observe('apiJob', {
      jobId: 'fixture',
      urn: 'urn:li:jobPosting:fixture',
      upstreamSignal: true,
    });

    expect(watcher.report().pendingDrift.apiJob?.map((field) => field.field)).toEqual([
      'upstreamSignal',
    ]);
  });
});
