/**
 * Shared no-actionable-input contract helper (pre-push GATE 47).
 *
 * A run that supplies no resolvable target — empty input, or another actor's
 * input shape pasted in (e.g. a Google-Maps `{searchString, mode:"reviews"}`
 * payload with no company/URL) — is user error or competitor spam, NOT a bug.
 * Such a run must end in a CONTROLLED success so it cannot dent the actor's
 * Apify Store success-rate or be weaponised by blank-run spam:
 *
 *   • NOT FAILED — never Actor.fail(); controlled Actor.exit() (success)
 *   • 0 dataset items pushed
 *   • 0 per-result actor charges (the 'Result' / apify-default-dataset-item event)
 *   • an opaque, user-safe log line (no methodology / infra / remediation detail)
 *
 * The platform's one-time `apify-actor-start` fee still applies — Apify bills it
 * on container boot, independent of Actor.charge(). That is unavoidable and out
 * of scope: do NOT try to charge or refund it here.
 *
 * PLACEMENT — call this from the no-actionable branch of input validation, sited
 * EARLY (right after Actor.getInput()/normalisation, BEFORE opening key-value
 * stores, browser sessions, state locks, or any network) so the direct
 * Actor.exit() never skips resource cleanup.
 *
 * Actor-awareness lives in the CALLER: each actor decides what "actionable"
 * means (its own target-field detection) and passes its own benign diag `emit`
 * hook. This helper only standardises the controlled exit.
 */
import { Actor, log } from 'apify';

/** Stable benign diag detail for a no-actionable-input controlled exit. */
export const NO_ACTIONABLE_INPUT_CODE = 'init.no_actionable_target';

/** Default opaque, user-safe message. Override per actor for field-accurate copy
 *  (e.g. "companyDomain, startUrls, companyName, or searchQuery"), but keep it
 *  generic — no internal methodology, infra, or operator remediation. */
export const NO_ACTIONABLE_INPUT_MESSAGE =
  'No search term, URL, or target was provided — nothing to scrape. '
  + 'Add a search query or a start URL and run again. Exiting with no results.';

export interface NoActionableExitOptions {
  /** Override the opaque user-facing log line. Keep it generic. */
  message?: string;
  /** Benign operator-only diag hook. Errors are swallowed (diag must never bubble). */
  emit?: (event: { type: 'info'; detail: string }) => unknown | Promise<unknown>;
  /** Optional terminal hook before exit, e.g. () => emitRunComplete(input, 0, 0).
   *  Errors are swallowed so the run still exits SUCCESS. */
  beforeExit?: () => unknown | Promise<unknown>;
}

/**
 * Controlled no-op success exit for a run with no actionable input. Logs an
 * opaque message, fires the optional benign diag + terminal hooks, then exits
 * SUCCESS. Never pushes dataset items, never charges, never throws.
 */
export async function exitNoActionableInput(opts: NoActionableExitOptions = {}): Promise<void> {
  log.info(opts.message ?? NO_ACTIONABLE_INPUT_MESSAGE);
  try {
    if (opts.emit) await opts.emit({ type: 'info', detail: NO_ACTIONABLE_INPUT_CODE });
  } catch { /* diag must never bubble */ }
  try {
    if (opts.beforeExit) await opts.beforeExit();
  } catch { /* terminal hook must never bubble */ }
  await Actor.exit();
}
