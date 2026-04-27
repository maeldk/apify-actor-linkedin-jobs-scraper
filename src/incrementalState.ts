/**
 * Incremental state model for cross-run change detection.
 *
 * State is a Map of jobId → JobStateEntry, persisted as a JSON object
 * in Apify's default key-value store under key `state_<stateKey>`.
 *
 * Design:
 * - Identity: jobId (sha256 of "<source>:<jobKey>") — stable across runs
 * - Change detection: trackedHash (sha256 of meaningful content fields)
 * - Universe isolation: each stateKey is independent
 */

import { createHash } from 'node:crypto';

// ── State entry for a single job ─────────────────────────────────────────

export interface JobStateEntry {
  /** Stable job identity */
  jobId: string;
  /** Source-derived content hash used for repost detection */
  contentHash: string | null;
  /** Hash of tracked content fields — change in this = UPDATED */
  trackedHash: string;
  /** ISO-8601 timestamp of first observation */
  firstSeenAt: string;
  /** ISO-8601 timestamp of most recent observation */
  lastSeenAt: string;
  /** Whether this job is currently active (not expired) */
  active: boolean;
  /** ISO-8601 timestamp when marked expired, null if active */
  expiredAt: string | null;
  /**
   * Minimal snapshot of identifying fields, captured at last-seen.
   * Allows EXPIRED items to be re-emitted with usable metadata even
   * after they disappear from upstream SERP results.
   */
  snapshot?: {
    linkedinJobId?: string | null;
    title?: string | null;
    company?: string | null;
    location?: string | null;
    jobUrl?: string | null;
    postedAt?: string | null;
  };
}

// ── Full state object ────────────────────────────────────────────────────

export interface IncrementalState {
  /** Schema version for forward compatibility */
  version: 1;
  /** The stateKey this state belongs to */
  stateKey: string;
  /** ISO-8601 timestamp of last state write */
  updatedAt: string;
  /** Map of jobId → state entry */
  jobs: Record<string, JobStateEntry>;
}

// ── Change classification ────────────────────────────────────────────────

export type ChangeType = 'NEW' | 'UPDATED' | 'UNCHANGED' | 'EXPIRED' | 'REAPPEARED';

export interface ClassifiedRecord {
  jobId: string;
  changeType: ChangeType;
  contentHash: string | null;
  trackedHash: string;
  firstSeenAt: string;
  lastSeenAt: string;
  previousSeenAt: string | null;
  expiredAt: string | null;
}

// ── Tracked content hash ─────────────────────────────────────────────────

/**
 * // CUSTOMIZE: TrackedFields — add/remove fields for your actor's change detection.
 *
 * INCLUDED (meaningful content that indicates a real change):
 *   title, company, location, salaryMin, salaryMax, salaryCurrency,
 *   salaryType, employmentType, description, postedDate, validThrough,
 *   canonicalUrl, applyUrl
 *
 * EXCLUDED (transient, derived, or unstable):
 *   jobId, jobKey — identity, not content
 *   fetchedAt, scrapedAt — changes every run
 *   contentQuality, detailFetched — scrape metadata
 *   searchQuery, searchUrl, sourceDomain, sourceUrl — query context
 *   country — derived from domain
 *   descriptionHtml — same content, different format
 */
export interface TrackedFields {
  title: string | null;
  company: string | null;
  location: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryType: string | null;
  employmentType: string | null;
  description: string | null;
  postedDate: string | null;
  validThrough: string | null;
  canonicalUrl: string | null;
  applyUrl: string | null;
}

/** All tracked field names in hash order — used for documentation and tests. */
export const TRACKED_FIELD_NAMES: ReadonlyArray<keyof TrackedFields> = [
  'title', 'company', 'location',
  'salaryMin', 'salaryMax', 'salaryCurrency', 'salaryType',
  'employmentType', 'description',
  'postedDate', 'validThrough',
  'canonicalUrl', 'applyUrl',
] as const;

/**
 * Build a SHA-256 hash of tracked content fields.
 * Only these fields trigger UPDATED classification when changed.
 */
export function buildTrackedHash(fields: TrackedFields): string {
  const parts = [
    fields.title ?? '',
    fields.company ?? '',
    fields.location ?? '',
    String(fields.salaryMin ?? ''),
    String(fields.salaryMax ?? ''),
    fields.salaryCurrency ?? '',
    fields.salaryType ?? '',
    fields.employmentType ?? '',
    fields.description ?? '',
    fields.postedDate ?? '',
    fields.validThrough ?? '',
    fields.canonicalUrl ?? '',
    fields.applyUrl ?? '',
  ].join('|');
  return createHash('sha256').update(parts, 'utf8').digest('hex');
}

// ── Classification logic ─────────────────────────────────────────────────

export function classifyJob(
  jobId: string,
  contentHash: string | null,
  trackedHash: string,
  now: string,
  priorState: IncrementalState | null,
): ClassifiedRecord {
  const prior = priorState?.jobs[jobId];

  if (!prior) {
    return {
      jobId, changeType: 'NEW', contentHash, trackedHash,
      firstSeenAt: now, lastSeenAt: now,
      previousSeenAt: null, expiredAt: null,
    };
  }

  if (!prior.active) {
    return {
      jobId, changeType: 'REAPPEARED', contentHash, trackedHash,
      firstSeenAt: prior.firstSeenAt, lastSeenAt: now,
      previousSeenAt: prior.lastSeenAt, expiredAt: null,
    };
  }

  if (prior.trackedHash !== trackedHash) {
    return {
      jobId, changeType: 'UPDATED', contentHash, trackedHash,
      firstSeenAt: prior.firstSeenAt, lastSeenAt: now,
      previousSeenAt: prior.lastSeenAt, expiredAt: null,
    };
  }

  return {
    jobId, changeType: 'UNCHANGED', contentHash, trackedHash,
    firstSeenAt: prior.firstSeenAt, lastSeenAt: now,
    previousSeenAt: prior.lastSeenAt, expiredAt: null,
  };
}

export function findExpiredJobs(
  currentJobIds: Set<string>,
  now: string,
  priorState: IncrementalState | null,
): ClassifiedRecord[] {
  if (!priorState) return [];

  const expired: ClassifiedRecord[] = [];
  for (const [jobId, entry] of Object.entries(priorState.jobs)) {
    if (!entry.active) continue;
    if (currentJobIds.has(jobId)) continue;

    expired.push({
      jobId, changeType: 'EXPIRED', contentHash: entry.contentHash, trackedHash: entry.trackedHash,
      firstSeenAt: entry.firstSeenAt, lastSeenAt: entry.lastSeenAt,
      previousSeenAt: entry.lastSeenAt, expiredAt: now,
    });
  }
  return expired;
}

// ── Repost detection ─────────────────────────────────────────────────────

export interface RepostMatch {
  jobId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  expiredAt: string | null;
}

export function detectRepostMatch(
  currentJobId: string,
  contentHash: string | null,
  priorState: IncrementalState | null,
): RepostMatch | null {
  if (!priorState || !contentHash) return null;

  for (const entry of Object.values(priorState.jobs)) {
    if (entry.jobId === currentJobId) continue;
    if (entry.active) continue;
    if (!entry.contentHash) continue;
    if (entry.contentHash !== contentHash) continue;

    return {
      jobId: entry.jobId,
      firstSeenAt: entry.firstSeenAt,
      lastSeenAt: entry.lastSeenAt,
      expiredAt: entry.expiredAt,
    };
  }

  return null;
}

// ── Pruning ─────────────────────────────────────────────────────────────

export const PRUNE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

export function pruneExpiredEntries(
  jobs: Record<string, JobStateEntry>,
  now: string,
  retentionMs: number = PRUNE_AFTER_MS,
): number {
  const nowMs = new Date(now).getTime();
  let pruned = 0;
  for (const [id, entry] of Object.entries(jobs)) {
    if (entry.active) continue;
    if (!entry.expiredAt) continue;
    const expiredMs = new Date(entry.expiredAt).getTime();
    if (isNaN(expiredMs)) continue;
    if (nowMs - expiredMs > retentionMs) {
      delete jobs[id];
      pruned++;
    }
  }
  return pruned;
}

// ── State mutation ───────────────────────────────────────────────────────

export function buildUpdatedState(
  stateKey: string,
  now: string,
  priorState: IncrementalState | null,
  classifications: ClassifiedRecord[],
  snapshots?: Map<string, NonNullable<JobStateEntry['snapshot']>>,
): IncrementalState {
  const jobs: Record<string, JobStateEntry> = {};

  if (priorState) {
    for (const [id, entry] of Object.entries(priorState.jobs)) {
      jobs[id] = { ...entry };
    }
  }

  for (const c of classifications) {
    if (c.changeType === 'EXPIRED') {
      const existing = jobs[c.jobId];
      if (existing) {
        existing.active = false;
        existing.expiredAt = c.expiredAt;
      }
    } else {
      const prior = jobs[c.jobId];
      jobs[c.jobId] = {
        jobId: c.jobId,
        contentHash: c.contentHash,
        trackedHash: c.trackedHash,
        firstSeenAt: c.firstSeenAt,
        lastSeenAt: c.lastSeenAt,
        active: true,
        expiredAt: null,
        snapshot: snapshots?.get(c.jobId) ?? prior?.snapshot,
      };
    }
  }

  pruneExpiredEntries(jobs, now);

  return { version: 1, stateKey, updatedAt: now, jobs };
}

// ── Emission policy ──────────────────────────────────────────────────────

export interface EmissionPolicy {
  emitUnchanged: boolean;
  emitExpired: boolean;
}

export function filterByEmissionPolicy(
  classifications: ClassifiedRecord[],
  policy: EmissionPolicy,
): ClassifiedRecord[] {
  return classifications.filter(c => {
    switch (c.changeType) {
      case 'NEW':
      case 'UPDATED':
      case 'REAPPEARED':
        return true;
      case 'UNCHANGED':
        return policy.emitUnchanged;
      case 'EXPIRED':
        return policy.emitExpired;
    }
  });
}

// ── KV store key helpers ─────────────────────────────────────────────────

export function stateKvKey(stateKey: string): string {
  return `state_${stateKey}`;
}

export function createEmptyState(stateKey: string, now: string): IncrementalState {
  return { version: 1, stateKey, updatedAt: now, jobs: {} };
}
