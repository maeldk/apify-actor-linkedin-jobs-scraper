import { Actor, log } from 'apify';
import type { Input, NormalizedInput, OutputItem } from './types.js';
import { DEFAULTS, COMPACT_FIELDS, AGENCY_KEYWORDS, URL_TRACKING_PARAMS } from './constants.js';
import { searchJobs, fetchJobDetail, fetchRelatedJobs, type SearchParams } from './apiClient.js';
import type { ApiJob } from './apiClient.js';
import { transformJob, mergeDetail } from './transform.js';
import { parseDetail } from './detailParser.js';
import {
    type IncrementalState, type ClassifiedRecord, type TrackedFields,
    buildTrackedHash, classifyJob, findExpiredJobs, buildUpdatedState,
    filterByEmissionPolicy, stateKvKey, detectRepostMatch,
} from './incrementalState.js';
import { lockKvKey, tryAcquire, verifyLock, type StateLock } from './stateLock.js';
import { sendAllNotifications, selectItemsToNotify, type NotificationConfig, type RunMetadata } from './notifications.js';
import { logRunFooter } from './runFooter.js';
import { resolveRegions } from './regionResolver.js';

const STATE_STORE = 'linkedin-jobs-state';

function normalizeInput(raw: Partial<Input>): NormalizedInput {
  return {
    keywords: (raw.keywords ?? '').trim(),
    location: raw.location?.trim() || undefined,
    geoIds: Array.isArray(raw.geoIds) ? raw.geoIds.filter(Boolean) : [],
    regions: Array.isArray(raw.regions) ? raw.regions.filter(Boolean) : [],
    regionPresets: raw.regionPresets ?? undefined,

    datePosted: raw.datePosted ?? 'anytime',
    jobType: raw.jobType ?? [],
    experienceLevel: raw.experienceLevel ?? [],
    workType: raw.workType ?? [],

    salaryMin: raw.salaryMin ?? undefined,
    salaryMax: raw.salaryMax ?? undefined,
    salaryIncludeUnknown: raw.salaryIncludeUnknown ?? true,

    companies: Array.isArray(raw.companies) ? raw.companies.filter(Boolean) : [],
    excludeCompanies: Array.isArray(raw.excludeCompanies) ? raw.excludeCompanies.filter(Boolean) : [],
    excludeKeywords: Array.isArray(raw.excludeKeywords) ? raw.excludeKeywords.filter(Boolean) : [],

    easyApply: raw.easyApply ?? false,
    removeAgency: raw.removeAgency ?? false,
    distance: raw.distance ?? undefined,
    sortBy: raw.sortBy ?? 'recent',

    startUrls: Array.isArray(raw.startUrls)
      ? raw.startUrls.map((u) => u?.url).filter((u): u is string => typeof u === 'string' && u.length > 0)
      : [],

    proxyConfiguration: raw.proxyConfiguration ?? { useApifyProxy: true, apifyProxyGroups: ['DATACENTER'] },

    linkedinHost: raw.linkedinHost ?? DEFAULTS.defaultLinkedinHost,
    outputLanguage: raw.outputLanguage ?? DEFAULTS.defaultOutputLanguage,

    incrementalMode: raw.incrementalMode ?? false,
    stateKey: raw.stateKey ?? null,
    outputMode: raw.outputMode ?? 'all',
    emitUnchanged: raw.emitUnchanged ?? false,
    emitExpired: raw.emitExpired ?? false,
    skipReposts: raw.skipReposts ?? false,
    enrichDetails: raw.enrichDetails ?? false,
    scopePerQuery: raw.scopePerQuery ?? false,

    discoverRelated: raw.discoverRelated ?? false,
    relatedSeedCount: Math.max(0, raw.relatedSeedCount ?? 5),

    telegramToken: raw.telegramToken ?? null,
    telegramChatId: raw.telegramChatId ?? null,
    discordWebhookUrl: raw.discordWebhookUrl ?? null,
    slackWebhookUrl: raw.slackWebhookUrl ?? null,
    whatsappAccessToken: raw.whatsappAccessToken ?? null,
    whatsappPhoneNumberId: raw.whatsappPhoneNumberId ?? null,
    whatsappTo: raw.whatsappTo ?? null,
    webhookUrl: raw.webhookUrl ?? null,
    webhookHeaders: raw.webhookHeaders ?? null,
    notificationLimit: raw.notificationLimit ?? 5,
    notifyOnlyChanges: raw.notifyOnlyChanges ?? false,

    compact: raw.compact ?? false,
    descriptionMaxLength: raw.descriptionMaxLength ?? 0,
    phoneExtractionMode: raw.phoneExtractionMode ?? 'strict',
    maxResults: raw.maxResults ?? DEFAULTS.maxResults,
  };
}

/** Strip known tracking params + sort remaining params; lowercase host. */
function canonicalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hostname = u.hostname.toLowerCase();
    const keep = new URLSearchParams();
    const entries = Array.from(u.searchParams.entries())
      .filter(([k]) => !URL_TRACKING_PARAMS.has(k))
      .sort(([a], [b]) => a.localeCompare(b));
    for (const [k, v] of entries) keep.append(k, v);
    u.search = keep.toString() ? `?${keep.toString()}` : '';
    u.hash = '';
    return u.toString();
  } catch {
    return raw;
  }
}

interface QuerySpec {
  label: string;
  params: SearchParams;
}

function expandGeoIds(input: NormalizedInput): { geoIds: string[]; unresolved: string[] } {
  const out = new Set<string>();
  for (const id of input.geoIds) out.add(id);
  if (input.regions.length > 0 || input.regionPresets) {
    const { geoIds, unresolved } = resolveRegions(input.regions, input.regionPresets);
    for (const id of geoIds) out.add(id);
    return { geoIds: Array.from(out), unresolved };
  }
  return { geoIds: Array.from(out), unresolved: [] };
}

function buildQueries(input: NormalizedInput): QuerySpec[] {
  const baseFilters: Omit<SearchParams, 'keywords' | 'location' | 'geoId'> = {
    distance: input.distance,
    datePosted: input.datePosted,
    workType: input.workType.length ? input.workType : undefined,
    experienceLevel: input.experienceLevel.length ? input.experienceLevel : undefined,
    jobType: input.jobType.length ? input.jobType : undefined,
    companies: input.companies.length ? input.companies : undefined,
    salaryMin: input.salaryMin,
    easyApply: input.easyApply || undefined,
    sortBy: input.sortBy,
    linkedinHost: input.linkedinHost,
    outputLanguage: input.outputLanguage,
  };

  const queries: QuerySpec[] = [];
  const { geoIds, unresolved } = expandGeoIds(input);
  if (unresolved.length > 0) {
    // Caller (main()) logs once before queries run, but re-emit here for buildQueries-only use.
  }

  if (geoIds.length) {
    for (const geoId of geoIds) {
      queries.push({
        label: `kw="${input.keywords}" geoId=${geoId}`,
        params: { ...baseFilters, keywords: input.keywords || undefined, geoId },
      });
    }
  } else {
    queries.push({
      label: `kw="${input.keywords}"${input.location ? ` loc="${input.location}"` : ''}`,
      params: { ...baseFilters, keywords: input.keywords || undefined, location: input.location },
    });
  }

  return queries;
}

function matchesAgency(company: string | null): boolean {
  if (!company) return false;
  const lc = company.toLowerCase();
  return AGENCY_KEYWORDS.some((kw) => lc.includes(kw));
}

function matchesExcluded(item: OutputItem, input: NormalizedInput): boolean {
  if (input.excludeKeywords.length && item.title) {
    const t = item.title.toLowerCase();
    if (input.excludeKeywords.some((kw) => t.includes(kw.toLowerCase()))) return true;
  }
  if (input.excludeCompanies.length && item.company) {
    const c = item.company.toLowerCase();
    if (input.excludeCompanies.some((kw) => c.includes(kw.toLowerCase()))) return true;
  }
  return false;
}

function withinSalaryFilter(item: OutputItem, input: NormalizedInput): boolean {
  if (input.salaryMin == null && input.salaryMax == null) return true;
  if (item.salaryMin == null && item.salaryMax == null) return input.salaryIncludeUnknown;
  if (input.salaryMin != null && (item.salaryMax ?? item.salaryMin ?? 0) < input.salaryMin) return false;
  if (input.salaryMax != null && (item.salaryMin ?? item.salaryMax ?? 0) > input.salaryMax) return false;
  return true;
}

async function runQuery(spec: QuerySpec, maxResultsHint: number, proxyUrl: string | undefined): Promise<ApiJob[]> {
  const seen = new Set<string>();
  const out: ApiJob[] = [];
  let start = 0;
  let consecutiveEmpty = 0;
  while (start < DEFAULTS.paginationHardCap) {
    const result = await searchJobs(spec.params, start, { proxyUrl });
    if (result.jobs.length === 0) {
      consecutiveEmpty++;
      if (consecutiveEmpty >= 2) break;
    } else {
      consecutiveEmpty = 0;
      for (const j of result.jobs) {
        if (seen.has(j.jobId)) continue;
        seen.add(j.jobId);
        out.push(j);
      }
    }
    if (!result.hasNextPage) break;
    if (maxResultsHint > 0 && out.length >= maxResultsHint * 1.5) break;
    start += DEFAULTS.pageSize;
  }
  log.info(`Query [${spec.label}]: ${out.length} unique cards from start=0..${start}`);
  return out;
}

async function main() {
  await Actor.init();

  try { await Actor.charge({ eventName: 'apify-actor-start', count: 1 }); } catch { /* non-PPE */ }

  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  if (nodeMajor >= 24) {
    log.error('Requires Node 20 or 22.');
    process.exitCode = 1;
    await Actor.exit();
    return;
  }

  const rawInput = await Actor.getInput<Partial<Input>>();
  const input = normalizeInput(rawInput ?? {});

  if (input.incrementalMode && !input.stateKey) {
    throw await Actor.fail('stateKey is required when incrementalMode is true.');
  }
  if (!input.keywords && !input.geoIds.length && !input.regions.length && !input.regionPresets && !input.location && !input.startUrls.length) {
    throw await Actor.fail('Provide at least one of: keywords, geoIds, regions, regionPresets, location, startUrls.');
  }
  if (input.regions.length > 0 || input.regionPresets) {
    const expanded = expandGeoIds(input);
    if (expanded.unresolved.length > 0) {
      log.warning(`Unmapped ISO-2 region codes: ${expanded.unresolved.join(', ')} — fall back to geoIds[] for these markets.`);
    }
    if (expanded.geoIds.length > input.geoIds.length) {
      log.info(`Expanded ${expanded.geoIds.length - input.geoIds.length} region/preset code(s) → geoIds`);
    }
  }
  if (input.startUrls.length) {
    log.warning(`startUrls[] received but advanced URL parsing is deferred to v0.5; ${input.startUrls.length} URLs ignored for v0.1 PoC.`);
    // Canonicalize for future state-fingerprint stability — validates URLs early.
    for (const u of input.startUrls) canonicalizeUrl(u);
  }

  const scrapedAt = new Date().toISOString();

  // ── Load prior incremental state ────────────────────────────────────
  let priorState: IncrementalState | null = null;
  let kvStore: Awaited<ReturnType<typeof Actor.openKeyValueStore>> | null = null;
  if (input.incrementalMode && input.stateKey) {
    kvStore = await Actor.openKeyValueStore(STATE_STORE);
    const key = stateKvKey(input.stateKey);
    const raw = await kvStore.getValue<IncrementalState>(key);
    if (raw && raw.version === 1 && raw.stateKey === input.stateKey) {
      priorState = raw;
      log.info(`Loaded prior state: ${Object.values(raw.jobs).filter((j) => j.active).length} active jobs`);
    }
    const lockKey = lockKvKey(input.stateKey);
    const existingLock = await kvStore.getValue<StateLock>(lockKey);
    const runId = process.env.APIFY_ACTOR_RUN_ID ?? 'local';
    const { result: lockResult, newLock } = tryAcquire(existingLock, runId, input.stateKey);
    if (!lockResult.acquired) {
      throw await Actor.fail(`Another run is using stateKey "${input.stateKey}".`);
    }
    if (newLock) await kvStore.setValue(lockKey, newLock);
  }

  const releaseLock = async () => {
    if (input.incrementalMode && input.stateKey && kvStore) {
      try { await kvStore.setValue(lockKvKey(input.stateKey), null); }
      catch (e) { log.warning(`Failed to release lock: ${e instanceof Error ? e.message : e}`); }
    }
  };

  try {
    const queries = buildQueries(input);
    log.info(`Running ${queries.length} ${queries.length === 1 ? 'query' : 'queries'}`);

    // Resolve Apify proxy URL (datacenter by default; user can override via proxyConfiguration)
    let proxyUrl: string | undefined;
    if (input.proxyConfiguration?.useApifyProxy !== false) {
      try {
        const cfg = await Actor.createProxyConfiguration(input.proxyConfiguration ?? { groups: ['DATACENTER'] });
        proxyUrl = await cfg?.newUrl();
        if (proxyUrl) log.info(`Using Apify Proxy (${input.proxyConfiguration?.apifyProxyGroups?.join(',') ?? 'DATACENTER'})`);
      } catch (e) {
        log.warning(`Could not create Apify Proxy configuration: ${e instanceof Error ? e.message : e}`);
      }
    }

    const seenJobIds = new Set<string>();
    const allJobs: ApiJob[] = [];
    for (const q of queries) {
      const jobs = await runQuery(q, input.maxResults, proxyUrl);
      for (const j of jobs) {
        if (seenJobIds.has(j.jobId)) continue;
        seenJobIds.add(j.jobId);
        allJobs.push(j);
      }
    }

    log.info(`Cross-query unique: ${allJobs.length} jobs`);

    // ── Optional discovery via /relatedJobs (v0.8) ──────────────────────
    if (input.discoverRelated && allJobs.length > 0 && input.relatedSeedCount > 0) {
      const seeds = allJobs.slice(0, input.relatedSeedCount);
      log.info(`Discovery: fetching relatedJobs for ${seeds.length} seed(s) (concurrency=${DEFAULTS.detailConcurrency})`);
      let added = 0;
      const queue = [...seeds];
      const workers = Array.from({ length: DEFAULTS.detailConcurrency }, async () => {
        while (queue.length > 0) {
          const seed = queue.shift();
          if (!seed) break;
          try {
            const related = await fetchRelatedJobs(seed.jobId, {
              proxyUrl,
              outputLanguage: input.outputLanguage,
              linkedinHost: input.linkedinHost,
            });
            for (const r of related) {
              if (seenJobIds.has(r.jobId)) continue;
              seenJobIds.add(r.jobId);
              allJobs.push(r);
              added++;
            }
          } catch (e) {
            log.debug(`relatedJobs failed for ${seed.jobId}: ${e instanceof Error ? e.message : e}`);
          }
        }
      });
      await Promise.all(workers);
      log.info(`Discovery: +${added} new jobs from relatedJobs (total now ${allJobs.length})`);
    }

    let items = allJobs.map((j) => transformJob(j, scrapedAt));
    if (input.removeAgency) items = items.filter((it) => !matchesAgency(it.company));
    items = items.filter((it) => !matchesExcluded(it, input));
    items = items.filter((it) => withinSalaryFilter(it, input));

    // ── Optional detail enrichment ──────────────────────────────────────
    if (input.enrichDetails && items.length > 0) {
      const enrichTarget = input.maxResults > 0
        ? items.slice(0, Math.min(items.length, input.maxResults))
        : items;
      log.info(`Enriching ${enrichTarget.length} item(s) with detail pages (concurrency=${DEFAULTS.detailConcurrency})`);
      let enriched = 0;
      let failed = 0;
      const queue = [...enrichTarget.entries()];
      const workers = Array.from({ length: DEFAULTS.detailConcurrency }, async () => {
        while (queue.length > 0) {
          const next = queue.shift();
          if (!next) break;
          const [idx, item] = next;
          try {
            const html = await fetchJobDetail(item.linkedinJobId, {
              proxyUrl,
              outputLanguage: input.outputLanguage,
              linkedinHost: input.linkedinHost,
            });
            if (html) {
              const detail = parseDetail(html);
              items[idx] = mergeDetail(item, detail);
              enriched++;
            } else {
              failed++;
            }
          } catch (e) {
            failed++;
            log.debug(`Detail fetch failed for ${item.linkedinJobId}: ${e instanceof Error ? e.message : e}`);
          }
        }
      });
      await Promise.all(workers);
      log.info(`Detail enrichment: ${enriched} enriched, ${failed} failed`);
    }

    // ── Incremental classification ──────────────────────────────────────
    if (input.incrementalMode && input.stateKey && kvStore) {
      const classifications: ClassifiedRecord[] = [];
      const currentIds = new Set<string>();
      for (const item of items) {
        currentIds.add(item.jobId);
        const tracked: TrackedFields = {
          title: item.title, company: item.company, location: item.location,
          salaryMin: item.salaryMin, salaryMax: item.salaryMax,
          salaryCurrency: item.salaryCurrency,
          salaryType: item.salaryPeriod,
          employmentType: item.employmentType,
          description: item.description,
          postedDate: item.postedAt,
          validThrough: null,
          canonicalUrl: item.jobUrl,
          applyUrl: item.applyUrl,
        };
        classifications.push(classifyJob(item.jobId, item.contentHash, buildTrackedHash(tracked), scrapedAt, priorState));
      }
      const expired = findExpiredJobs(currentIds, scrapedAt, priorState);
      classifications.push(...expired);

      const toEmit = filterByEmissionPolicy(classifications, {
        emitUnchanged: input.emitUnchanged,
        emitExpired: input.emitExpired,
      });
      const classMap = new Map(toEmit.map((c) => [c.jobId, c]));

      // Snapshot map: captured for new state so EXPIRED items can be re-emitted on later runs.
      const snapshots = new Map<string, NonNullable<import('./incrementalState.js').JobStateEntry['snapshot']>>();
      for (const item of items) {
        snapshots.set(item.jobId, {
          linkedinJobId: item.linkedinJobId,
          title: item.title,
          company: item.company,
          location: item.location,
          jobUrl: item.jobUrl,
          postedAt: item.postedAt,
        });
      }

      const toPush: Record<string, unknown>[] = [];
      const itemByJobId = new Map(items.map((it) => [it.jobId, it]));
      let activeEmitted = 0;
      // Pass 1: EXPIRED stubs (don't count toward maxResults — they're disappearance notifications)
      for (const c of toEmit) {
        if (c.changeType !== 'EXPIRED') continue;
        if (!input.emitExpired) continue;
        const snap = priorState?.jobs[c.jobId]?.snapshot;
        const stub = buildExpiredStub(c.jobId, c, snap ?? null, scrapedAt);
        toPush.push(input.compact ? filterCompact(stub) : stub);
      }
      // Pass 2: NEW/UPDATED/UNCHANGED/REAPPEARED items (counted by maxResults)
      for (const c of toEmit) {
        if (c.changeType === 'EXPIRED') continue;
        if (input.maxResults > 0 && activeEmitted >= input.maxResults) break;
        const item = itemByJobId.get(c.jobId);
        if (!item) continue;
        const repostMatch = detectRepostMatch(item.jobId, item.contentHash, priorState);
        const isRepost = Boolean(repostMatch);
        if (input.skipReposts && isRepost) continue;
        const finalItem: OutputItem = {
          ...item,
          changeType: c.changeType,
          firstSeenAt: c.firstSeenAt,
          lastSeenAt: c.lastSeenAt,
          previousSeenAt: c.previousSeenAt,
          expiredAt: c.expiredAt,
          isRepost,
          repostOfId: repostMatch?.jobId ?? null,
          repostDetectedAt: repostMatch ? scrapedAt : null,
        };
        toPush.push(input.compact ? filterCompact(finalItem) : finalItem);
        activeEmitted++;
      }

      if (toPush.length > 0) {
        await Actor.pushData(toPush);
        try { await Actor.charge({ eventName: 'apify-default-dataset-item', count: toPush.length }); } catch {}
      }
      await dispatchNotifications(input, toPush as unknown as OutputItem[], scrapedAt);

      const lockKey = lockKvKey(input.stateKey);
      const runId = process.env.APIFY_ACTOR_RUN_ID ?? 'local';
      const currentLock = await kvStore.getValue<StateLock>(lockKey);
      if (!verifyLock(currentLock, runId)) {
        throw await Actor.fail('State lock lost during run.');
      }
      await kvStore.setValue(stateKvKey(input.stateKey), buildUpdatedState(input.stateKey, scrapedAt, priorState, classifications, snapshots));

      const unchangedSkipped = classifications.filter((c) => c.changeType === 'UNCHANGED').length;
      log.info('Incremental complete', { emitted: toPush.length, unchangedSkipped });
      logRunFooter({
        actorSlug: 'blackfalcondata/linkedin-jobs-scraper',
        emitted: toPush.length,
        unchangedSkipped,
        pricePerResult: DEFAULTS.pricePerResult,
      });
      return;
    }

    // ── Non-incremental push ─────────────────────────────────────────────
    const toPush: Record<string, unknown>[] = [];
    for (const item of items) {
      if (input.maxResults > 0 && toPush.length >= input.maxResults) break;
      toPush.push(input.compact ? filterCompact(item) : item);
    }

    if (toPush.length > 0) {
      await Actor.pushData(toPush);
      try { await Actor.charge({ eventName: 'apify-default-dataset-item', count: toPush.length }); } catch {}
    }

    log.info(`Done. Pushed ${toPush.length} items.`);
    await dispatchNotifications(input, toPush as unknown as OutputItem[], scrapedAt);
    logRunFooter({
      actorSlug: 'blackfalcondata/linkedin-jobs-scraper',
      emitted: toPush.length,
      pricePerResult: DEFAULTS.pricePerResult,
    });
  } finally {
    await releaseLock();
  }

  await Actor.exit();
}

async function dispatchNotifications(input: NormalizedInput, pushed: OutputItem[], scrapedAt: string): Promise<void> {
  const hasAny = input.telegramToken || input.discordWebhookUrl || input.slackWebhookUrl
    || (input.whatsappPhoneNumberId && input.whatsappAccessToken && input.whatsappTo)
    || input.webhookUrl;
  if (!hasAny) return;

  const config: NotificationConfig = {
    telegramToken: input.telegramToken,
    telegramChatId: input.telegramChatId,
    discordWebhookUrl: input.discordWebhookUrl,
    slackWebhookUrl: input.slackWebhookUrl,
    whatsappPhoneNumberId: input.whatsappPhoneNumberId,
    whatsappAccessToken: input.whatsappAccessToken,
    whatsappTo: input.whatsappTo,
    webhookUrl: input.webhookUrl,
    webhookHeaders: input.webhookHeaders,
    notificationLimit: input.notificationLimit,
    includeRunMetadata: true,
  };
  const toNotify = selectItemsToNotify(pushed, input.notifyOnlyChanges, input.incrementalMode);
  const metadata: RunMetadata = {
    searchLabel: ['LinkedIn:', input.keywords || 'all jobs', input.location, input.geoIds.join(',') || undefined].filter(Boolean).join(' · '),
    totalEmitted: pushed.length,
    runAt: scrapedAt,
  };
  const { sent, failed } = await sendAllNotifications(config, toNotify, metadata);
  if (sent.length > 0) log.info(`Notifications sent: ${sent.join(', ')}`);
  for (const f of failed) log.warning(`Notification failed [${f.platform}]: ${f.error}`);
}

function buildExpiredStub(
  jobId: string,
  c: ClassifiedRecord,
  snap: NonNullable<import('./incrementalState.js').JobStateEntry['snapshot']> | null,
  scrapedAt: string,
): OutputItem {
  return {
    scrapedAt,
    portalUrl: 'https://www.linkedin.com',
    source: 'linkedin',
    jobId,
    linkedinJobId: snap?.linkedinJobId ?? '',
    jobUrl: snap?.jobUrl ?? null,
    title: snap?.title ?? null,
    company: snap?.company ?? null,
    companyUrl: null, companyId: null,
    location: snap?.location ?? null,
    country: null,
    postedAt: snap?.postedAt ?? null,
    applyUrl: snap?.jobUrl ?? null,
    applyType: null,
    description: null, descriptionHtml: null, descriptionMarkdown: null,
    seniorityLevel: null, employmentType: null, industry: null, jobFunction: null,
    workplaceType: null, applicantCount: null, easyApply: null,
    salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null,
    salarySource: null, salaryIsPredicted: null,
    companyLogo: null, companyDescription: null, companyEmployeeCount: null,
    companyWebsite: null, companyAddress: null,
    recruiterName: null, recruiterUrl: null, recruiterTitle: null,
    extractedEmails: [], extractedPhones: [], extractedUrls: [],
    socialProfiles: { linkedin: [], twitter: [], instagram: [], facebook: [], youtube: [], tiktok: [], github: [], xing: [] },
    changeType: 'EXPIRED',
    firstSeenAt: c.firstSeenAt,
    lastSeenAt: c.lastSeenAt,
    previousSeenAt: c.previousSeenAt,
    expiredAt: c.expiredAt,
    isRepost: null, repostOfId: null, repostDetectedAt: null,
    language: null,
    contentHash: c.contentHash ?? '',
    isPromoted: null, postingBenefits: null, trackingId: null,
  };
}

function filterCompact(item: OutputItem): Partial<OutputItem> {
  const compact: Record<string, unknown> = {};
  for (const key of COMPACT_FIELDS) {
    if (key in item) compact[key] = (item as unknown as Record<string, unknown>)[key];
  }
  return compact as Partial<OutputItem>;
}

await main();
