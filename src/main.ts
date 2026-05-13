import { Actor, log } from 'apify';
import type { Input, NormalizedInput, OutputItem } from './types.js';
import { DEFAULTS, COMPACT_FIELDS, AGENCY_KEYWORDS, URL_TRACKING_PARAMS } from './constants.js';
import { searchJobs, fetchJobDetail, fetchRelatedJobs, type SearchParams } from './apiClient.js';
import type { ApiJob } from './apiClient.js';
import { transformJob, mergeDetail, applyDescriptionMaxLength, inferCountryHintFromSearchLocation } from './transform.js';
import { parseDetail } from './detailParser.js';
import {
    type IncrementalState, type ClassifiedRecord, type TrackedFields,
    buildTrackedHash, classifyJob, findExpiredJobs, buildUpdatedState,
    filterByEmissionPolicy, stateKvKey, detectRepostMatch,
} from './incrementalState.js';
import { lockKvKey, tryAcquire, verifyLock, type StateLock } from './stateLock.js';
import { buildStateKey } from './buildStateKey.js';
import { sendAllNotifications, selectItemsToNotify, type NotificationConfig, type RunMetadata } from './notifications.js';
import { logRunFooter } from './runFooter.js';
import { emit, sanitizeInputForDiag, userSafeError, UserSafeError, type ErrCode } from './diag.js';
import { GEOID_TO_ISO2, resolveRegions } from './regionResolver.js';
import { cleanString, cleanNumericList, normalizeInput, normalizeLinkedinHost } from './inputNormalize.js';

function classifyFallbackErrCode(internalCause: unknown, fallback: ErrCode): ErrCode {
  if (fallback !== 'LIN-9000') return fallback;
  const text = internalCause instanceof Error ? internalCause.message : String(internalCause);
  const msg = text.toLowerCase();
  if (/\b(429|rate.?limit|too many requests)\b/i.test(text)) return 'LIN-2030';
  if (/\b(403|401|unauthori[sz]ed|forbidden|blocked|waf|cloudflare|akamai|challenge|captcha)\b/i.test(text)) return 'LIN-2030';
  if (/\b(http|api|status|returned|failed)\b/i.test(text) && /\b5\d{2}\b/.test(text)) return 'LIN-2010';
  if (/\b(http|api|status|returned|failed)\b/i.test(text) && /\b[4-5]\d{2}\b/.test(text)) return 'LIN-2010';
  if (/\b(unexpected|invalid|parse|json|shape|missing|endpoint may have changed|structure)\b/i.test(text)) return 'LIN-3001';
  if (/\b(timeout|timed out|econnreset|econnrefused|enotfound|network|socket|fetch failed|abort)\b/i.test(text)) return 'LIN-2001';
  if (/\b(lock lost|state lock lost)\b/i.test(msg)) return 'LIN-4001';
  return fallback;
}
async function failWith(internalCause: unknown, code: ErrCode, runStartTs: number, emitted: number, unchangedSkipped: number): Promise<never> {
  const effectiveCode: ErrCode = internalCause instanceof UserSafeError ? internalCause.code : classifyFallbackErrCode(internalCause, code);
  await emit({
    type: 'run.complete',
    code: effectiveCode,
    payload: { emitted, unchangedSkipped, totalReviews: emitted + unchangedSkipped, status: 'failed', ok: false, durationMs: Date.now() - runStartTs },
    cause: internalCause,
  });
  const safeMsg = internalCause instanceof UserSafeError ? internalCause.message : userSafeError(internalCause, effectiveCode).message;
  await Actor.fail(safeMsg);
  throw new Error(safeMsg);
}

const STATE_STORE = 'linkedin-jobs-state';

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
  params: SearchParams;
  countryHint: string | null;
}

const TPR_REVERSE: Record<string, NonNullable<SearchParams['datePosted']>> = {
  r3600: 'lastHour',
  r86400: 'last24h',
  r604800: 'last7d',
  r2592000: 'last30d',
};
const WT_REVERSE: Record<string, NonNullable<SearchParams['workType']>[number]> = { '1': 'onsite', '2': 'remote', '3': 'hybrid' };
const E_REVERSE: Record<string, NonNullable<SearchParams['experienceLevel']>[number]> = {
  '1': 'internship', '2': 'entry', '3': 'associate', '4': 'mid_senior', '5': 'director', '6': 'executive',
};
const JT_REVERSE: Record<string, NonNullable<SearchParams['jobType']>[number]> = {
  F: 'fulltime', P: 'parttime', C: 'contract', T: 'temporary', I: 'internship', V: 'volunteer', O: 'other',
};
const SB2_REVERSE: Record<string, number> = {
  '1': 40_000, '2': 60_000, '3': 80_000, '4': 100_000, '5': 120_000, '6': 140_000, '7': 160_000,
};

function countryHintFromGeoId(geoId: string | undefined): string | null {
  return geoId ? GEOID_TO_ISO2[geoId] ?? null : null;
}

function countryHintFromSearchParams(params: SearchParams): string | null {
  return countryHintFromGeoId(params.geoId) ?? inferCountryHintFromSearchLocation(params.location);
}

function csvParam<T extends string>(raw: string | null, map: Record<string, T>): T[] | undefined {
  if (!raw) return undefined;
  const seen = new Set<T>();
  const values: T[] = [];
  for (const part of raw.split(',')) {
    const value = map[part.trim()];
    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }
  return values.length ? values : undefined;
}

function parseStartUrl(raw: string, input: NormalizedInput): SearchParams {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UserSafeError('[LIN-1001] startUrls must contain valid LinkedIn job search URLs.', 'LIN-1001', null);
  }
  if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) {
    throw new UserSafeError('[LIN-1001] startUrls must be LinkedIn job search URLs.', 'LIN-1001', null);
  }
  if (!/\/jobs\/search/i.test(url.pathname) && !/\/jobs-guest\/jobs\/api\/seeMoreJobPostings\/search/i.test(url.pathname)) {
    throw new UserSafeError('[LIN-1001] Only LinkedIn job search URLs are supported in startUrls.', 'LIN-1001', null);
  }
  const p = url.searchParams;
  const distance = p.get('distance');
  const parsedDistance = distance != null ? Number(distance) : undefined;
  const salaryMin = p.get('f_SB2');
  const companies = cleanNumericList(p.get('f_C')?.split(',') ?? []);
  return {
    keywords: cleanString(p.get('keywords')) ?? (input.keywords || undefined),
    location: cleanString(p.get('location')) ?? input.location,
    geoId: cleanNumericList([p.get('geoId')])[0],
    distance: parsedDistance != null && Number.isFinite(parsedDistance) ? parsedDistance : input.distance,
    datePosted: TPR_REVERSE[p.get('f_TPR') ?? ''] ?? input.datePosted,
    workType: csvParam(p.get('f_WT'), WT_REVERSE) ?? (input.workType.length ? input.workType : undefined),
    experienceLevel: csvParam(p.get('f_E'), E_REVERSE) ?? (input.experienceLevel.length ? input.experienceLevel : undefined),
    jobType: csvParam(p.get('f_JT'), JT_REVERSE) ?? (input.jobType.length ? input.jobType : undefined),
    companies: companies.length ? companies : (input.companies.length ? input.companies : undefined),
    salaryMin: salaryMin != null ? SB2_REVERSE[salaryMin] : input.salaryMin,
    easyApply: p.get('f_AL') === 'true' || input.easyApply || undefined,
    sortBy: p.get('sortBy') === 'R' ? 'relevant' : input.sortBy,
    linkedinHost: normalizeLinkedinHost(url.hostname),
    outputLanguage: input.outputLanguage,
  };
}

function buildStateKeyDimensions(input: NormalizedInput): Record<string, unknown> {
  return {
    geoIds: input.geoIds,
    regions: input.regions,
    regionPresets: input.regionPresets,
    datePosted: input.datePosted,
    jobType: input.jobType,
    experienceLevel: input.experienceLevel,
    workType: input.workType,
    salaryMin: input.salaryMin,
    salaryMax: input.salaryMax,
    salaryIncludeUnknown: input.salaryIncludeUnknown,
    companies: input.companies,
    excludeCompanies: input.excludeCompanies,
    excludeKeywords: input.excludeKeywords,
    easyApply: input.easyApply,
    removeAgency: input.removeAgency,
    distance: input.distance,
    sortBy: input.sortBy,
    linkedinHost: input.linkedinHost,
    outputLanguage: input.outputLanguage,
    discoverRelated: input.discoverRelated,
    relatedSeedCount: input.relatedSeedCount,
    enrichDetails: input.enrichDetails,
    startUrls: input.startUrls.map(canonicalizeUrl),
  };
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
  if (input.startUrls.length) {
    for (const url of input.startUrls) {
      const params = parseStartUrl(url, input);
      queries.push({ params, countryHint: countryHintFromSearchParams(params) });
    }
    return queries;
  }

  const { geoIds, unresolved } = expandGeoIds(input);
  if (unresolved.length > 0) {
    // Caller (main()) logs once before queries run, but re-emit here for buildQueries-only use.
  }

  if (geoIds.length) {
    for (const geoId of geoIds) {
      queries.push({
        params: { ...baseFilters, keywords: input.keywords || undefined, geoId },
        countryHint: countryHintFromSearchParams({ ...baseFilters, geoId }),
      });
    }
  } else {
    const params = { ...baseFilters, keywords: input.keywords || undefined, location: input.location };
    queries.push({
      params,
      countryHint: countryHintFromSearchParams(params),
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

function isMeaningfulResult(item: OutputItem): boolean {
  return Boolean(item.linkedinJobId && (item.title || item.company || item.jobUrl || item.location));
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
  log.info(`Fetched ${out.length} jobs for one search.`);
  return out;
}

async function main() {
  await Actor.init();
  const runStartTs = Date.now();
  let emittedCount = 0;
  let unchangedSkipped = 0;
  const heartbeatInterval = setInterval(() => {
    void emit({ type: 'info', detail: 'heartbeat', payload: { elapsedMs: Date.now() - runStartTs } });
  }, 60_000);
  if (typeof heartbeatInterval.unref === 'function') heartbeatInterval.unref();

  try { await Actor.charge({ eventName: 'apify-actor-start', count: 1 }); } catch { /* non-PPE */ }

  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  if (nodeMajor >= 24) {
    log.error('Requires Node 22.');
    process.exitCode = 1;
    await Actor.exit();
    return;
  }

  const rawInput = await Actor.getInput<Partial<Input>>();
  await emit({ type: 'run.start', payload: { input: sanitizeInputForDiag(rawInput) } });
  const input = normalizeInput(rawInput ?? {});

  if (input.incrementalMode && !input.stateKey) {
    input.stateKey = buildStateKey({
      keyword: input.keywords || null,
      location: input.location ?? null,
      dimensions: buildStateKeyDimensions(input),
    });
    log.debug(`Auto-derived stateKey: ${input.stateKey}`);
  }
  if (!input.keywords && !input.geoIds.length && !input.regions.length && !input.regionPresets && !input.location && !input.startUrls.length) {
    await failWith(new Error('Provide at least one of: keywords, geoIds, regions, regionPresets, location, startUrls.'), 'LIN-1001', runStartTs, 0, 0);
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
  // ── Load prior incremental state ────────────────────────────────────
  let priorState: IncrementalState | null = null;
  let kvStore: Awaited<ReturnType<typeof Actor.openKeyValueStore>> | null = null;
  if (input.incrementalMode && input.stateKey) {
    kvStore = await Actor.openKeyValueStore(STATE_STORE);
    const key = stateKvKey(input.stateKey);
    const raw = await kvStore.getValue<IncrementalState>(key);
    if (raw && raw.version === 1 && raw.stateKey === input.stateKey) {
      priorState = raw;
      log.debug(`Loaded prior state: ${Object.values(raw.jobs).filter((j) => j.active).length} active jobs`);
    }
    const lockKey = lockKvKey(input.stateKey);
    const existingLock = await kvStore.getValue<StateLock>(lockKey);
    const runId = process.env.APIFY_ACTOR_RUN_ID ?? 'local';
    const { result: lockResult, newLock } = tryAcquire(existingLock, runId, input.stateKey);
    if (!lockResult.acquired) {
      log.warning(`State lock held by another run for stateKey "${input.stateKey}" — exiting gracefully.`);
      await emit({ type: 'run.complete', payload: { emitted: 0, unchangedSkipped: 0, totalReviews: 0, status: 'success', ok: true, durationMs: Date.now() - runStartTs, reason: 'lock_busy' } });
      await Actor.exit();
      return;
    }
    if (newLock) await kvStore.setValue(lockKey, newLock);
  }

  const releaseLock = async () => {
    if (input.incrementalMode && input.stateKey && kvStore) {
      try { await kvStore.setValue(lockKvKey(input.stateKey), null); }
      catch (e) { log.warning(`Failed to release lock: ${e instanceof Error ? e.message : e}`); }
    }
  };

  const scrapedAt = new Date().toISOString();

  try {
    const queries = buildQueries(input);
    log.info(`Running ${queries.length} ${queries.length === 1 ? 'query' : 'queries'}`);

    // Resolve Apify proxy URL (datacenter by default; user can override via proxyConfiguration)
    let proxyUrl: string | undefined;
    if (input.proxyConfiguration?.useApifyProxy !== false) {
      try {
        const cfg = await Actor.createProxyConfiguration(input.proxyConfiguration ?? { groups: ['DATACENTER'] });
        proxyUrl = await cfg?.newUrl();
        if (proxyUrl) log.info('Using configured proxy.');
      } catch (e) {
        log.warning(`Could not create Apify Proxy configuration: ${e instanceof Error ? e.message : e}`);
      }
    }

    const seenJobIds = new Set<string>();
    const allJobs: ApiJob[] = [];
    const countryHints = new Map<string, string | null>();
    for (const q of queries) {
      const jobs = await runQuery(q, input.maxResults, proxyUrl);
      for (const j of jobs) {
        if (seenJobIds.has(j.jobId)) continue;
        seenJobIds.add(j.jobId);
        countryHints.set(j.jobId, q.countryHint);
        allJobs.push(j);
      }
    }

    log.info(`Fetched ${allJobs.length} unique jobs.`);

    // ── Optional result expansion ───────────────────────────────────────
    if (input.discoverRelated && allJobs.length > 0 && input.relatedSeedCount > 0) {
      const seeds = allJobs.slice(0, input.relatedSeedCount);
      log.info('Expanding results.');
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
              countryHints.set(r.jobId, null);
              allJobs.push(r);
              added++;
            }
          } catch (e) {
            log.debug(`relatedJobs failed for ${seed.jobId}: ${e instanceof Error ? e.message : e}`);
          }
        }
      });
      await Promise.all(workers);
      log.info(`Expanded results: ${added} additional jobs.`);
    }

    let items = allJobs.map((j) => transformJob(j, scrapedAt, countryHints.get(j.jobId) ?? null)).filter(isMeaningfulResult);
    if (input.removeAgency) items = items.filter((it) => !matchesAgency(it.company));
    items = items.filter((it) => !matchesExcluded(it, input));
    items = items.filter((it) => withinSalaryFilter(it, input));

    // ── Optional detail enrichment ──────────────────────────────────────
    if (input.enrichDetails && items.length > 0) {
      const enrichTarget = input.maxResults > 0
        ? items.slice(0, Math.min(items.length, input.maxResults))
        : items;
      log.info(`Enriching ${enrichTarget.length} item(s).`);
      let enriched = 0;
      let failed = 0;
      const queue = [...enrichTarget.entries()];
      const workers = Array.from({ length: DEFAULTS.detailConcurrency }, async () => {
        while (queue.length > 0) {
          const next = queue.shift();
          if (!next) break;
          const [idx, item] = next;
          if (!item.linkedinJobId) {
            failed++;
            continue;
          }
          try {
            const html = await fetchJobDetail(item.linkedinJobId, {
              proxyUrl,
              outputLanguage: input.outputLanguage,
              linkedinHost: input.linkedinHost,
            });
            if (html) {
              const detail = parseDetail(html);
              items[idx] = mergeDetail(item, detail, input.phoneExtractionMode);
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
        outputMode: input.outputMode,
        emitUnchanged: input.emitUnchanged,
        emitExpired: input.emitExpired,
      });

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
        const outputItem = applyDescriptionMaxLength(finalItem, input.descriptionMaxLength);
        toPush.push(input.compact ? filterCompact(outputItem) : outputItem);
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
        await failWith(new Error('state lock lost during run'), 'LIN-4001', runStartTs, emittedCount ?? 0, unchangedSkipped ?? 0);
      }
      await kvStore.setValue(stateKvKey(input.stateKey), buildUpdatedState(input.stateKey, scrapedAt, priorState, classifications, snapshots));

      unchangedSkipped = classifications.filter((c) => c.changeType === 'UNCHANGED').length;
      log.info('Incremental complete', { emitted: toPush.length, unchangedSkipped });
      logRunFooter({
        actorSlug: 'blackfalcondata/linkedin-jobs-scraper',
        emitted: toPush.length,
        unchangedSkipped,
        pricePerResult: DEFAULTS.pricePerResult,
      });
      emittedCount = toPush.length;
    } else {

      // ── Non-incremental push ─────────────────────────────────────────────
      const toPush: Record<string, unknown>[] = [];
      for (const item of items) {
        if (input.maxResults > 0 && toPush.length >= input.maxResults) break;
        const outputItem = applyDescriptionMaxLength(item, input.descriptionMaxLength);
        toPush.push(input.compact ? filterCompact(outputItem) : outputItem);
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
      emittedCount = toPush.length;
    }
  } catch (e) {
    if (e instanceof Error && /^\[LIN-\d{4}\]/.test(e.message)) throw e;
    await failWith(e, 'LIN-9000', runStartTs, emittedCount, unchangedSkipped);
  } finally {
    await releaseLock();
  }

  await emit({ type: 'run.complete', payload: { emitted: emittedCount, unchangedSkipped, totalReviews: emittedCount + unchangedSkipped, status: 'success', ok: true, durationMs: Date.now() - runStartTs } });


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
    linkedinJobId: snap?.linkedinJobId ?? null,
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
    aiSummary: null, skills: [],
    seniorityLevel: null, employmentType: null, industry: null, jobFunction: null,
    workplaceType: null, applicantCount: null, easyApply: null,
    salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null,
    salarySource: null, salaryIsPredicted: null,
    companyLogo: null, companyDescription: null, companyEmployeeCount: null,
    companyWebsite: null, companyAddress: null,
    contactName: null,
    recruiterName: null, recruiterUrl: null, recruiterTitle: null,
    contactEmail: null, contactPhone: null,
    companyLinkedIn: null, companySocialLinks: null,
    applyEmail: null,
    extractedEmails: [], extractedPhones: [], extractedUrls: [],
    socialProfiles: { linkedin: [], twitter: [], instagram: [], facebook: [], youtube: [], tiktok: [], github: [], xing: [] },
    changeType: 'EXPIRED',
    firstSeenAt: c.firstSeenAt,
    lastSeenAt: c.lastSeenAt,
    previousSeenAt: c.previousSeenAt,
    expiredAt: c.expiredAt,
    isRepost: null, repostOfId: null, repostDetectedAt: null,
    language: null,
    contentHash: c.contentHash ?? null,
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
