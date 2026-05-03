/**
 * Run footer — log a friendly review/feedback prompt at the end of every
 * meaningful run. Visible only in Apify Console run-log, never in dataset.
 *
 * Optionally shows incremental-mode savings: when a run skipped already-seen
 * jobs via state-keyed dedup, displays "$X saved (Y%) via incremental mode" — a
 * subtle but powerful marketing nudge that reinforces the customer's choice
 * and creates psychological lock-in.
 *
 * Canonical source. Copy verbatim to each actor's src/runFooter.ts.
 *
 * Usage (call once, last thing before Actor.exit()):
 *
 *   import { logRunFooter } from './runFooter.js';
 *   logRunFooter({
 *     actorSlug: 'blackfalcondata/linkedin-jobs-incremental-feed',
 *     emitted: summary.new + summary.updated,
 *     unchangedSkipped: summary.unchanged,  // optional — only when incremental
 *     pricePerResult: 0.001,                 // optional — must match pricing
 *   });
 *
 * Skips canary/probe/test runs by default (emitted < 20).
 */

import { log } from 'apify';

export interface RunFooterOptions {
  /** Apify actor slug, e.g. "blackfalcondata/seek-scraper" */
  actorSlug: string;
  /** Number of NEW + UPDATED items pushed to dataset this run */
  emitted: number;
  /** Number of UNCHANGED jobs skipped via incremental dedup (optional).
   *  When provided alongside pricePerResult, the footer shows savings. */
  unchangedSkipped?: number;
  /** Headline price per result in USD (e.g. 0.001 = $1.00 per 1000).
   *  Used for the savings calculation. Must match the actor's pricing. */
  pricePerResult?: number;
  /** Only show when emitted >= this (default 20). Skips canary/test runs. */
  minThreshold?: number;
}

export function logRunFooter(opts: RunFooterOptions): void {
  // Threshold checks total observed activity (emitted + skipped via incremental)
  // so "almost all unchanged" runs still surface the savings nudge.
  const totalActivity = opts.emitted + (opts.unchangedSkipped ?? 0);
  if (totalActivity < (opts.minThreshold ?? 20)) return;
  log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log.info(`✓ ${opts.emitted.toLocaleString('en-US')} new/updated jobs exported`);

  // Savings line — only when incremental mode actually skipped jobs
  if (opts.unchangedSkipped && opts.unchangedSkipped > 0 && opts.pricePerResult && opts.pricePerResult > 0) {
    const totalSeen = opts.emitted + opts.unchangedSkipped;
    const savedUsd = opts.unchangedSkipped * opts.pricePerResult;
    const savedPct = Math.round((opts.unchangedSkipped / totalSeen) * 100);
    log.info(`💸 ~$${savedUsd.toFixed(2)} saved (${savedPct}%) via incremental mode — ${opts.unchangedSkipped.toLocaleString('en-US')} already-seen jobs skipped`);
  }

  log.info('✨ Like this scraper? Leave a quick review:');
  log.info(`   https://apify.com/${opts.actorSlug}/reviews`);
  log.info('💬 Found a bug or want a new feature?');
  log.info(`   https://apify.com/${opts.actorSlug}/issues`);
  log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}
