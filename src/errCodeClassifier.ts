export interface ErrCodeMap {
  rateLimit: string;
  authBlock: string;
  http5xx: string;
  httpOther: string;
  parseError: string;
  networkTimeout: string;
  lockLost: string;
  platformUsageLimit?: string;
}

export function classifyFallbackErrCode(
  internalCause: unknown,
  fallback: string,
  prefix: string,
  codes: ErrCodeMap,
): string {
  if (fallback !== `${prefix}-9000`) return fallback;

  const text = internalCause instanceof Error ? internalCause.message : String(internalCause);
  const msg = text.toLowerCase();

  if (
    codes.platformUsageLimit
    && (/monthly usage hard limit exceeded/i.test(text) || /platform-feature-disabled/i.test(text))
  ) {
    return `${prefix}-${codes.platformUsageLimit}`;
  }
  if (/\b(429|rate.?limit|too many requests)\b/i.test(text)) return `${prefix}-${codes.rateLimit}`;
  if (/\b(403|401|unauthori[sz]ed|forbidden|blocked|waf|cloudflare|akamai|challenge|captcha)\b/i.test(text)) return `${prefix}-${codes.authBlock}`;
  if (/\b(http|api|status|returned|failed)\b/i.test(text) && /\b5\d{2}\b/.test(text)) return `${prefix}-${codes.http5xx}`;
  if (/\b(http|api|status|returned|failed)\b/i.test(text) && /\b[1-5]\d{2}\b/.test(text)) return `${prefix}-${codes.httpOther}`;
  if (/\b(unexpected|invalid|parse|json|shape|missing|endpoint may have changed|structure)\b/i.test(text)) return `${prefix}-${codes.parseError}`;
  if (/\b(timeout|timed out|econnreset|econnrefused|enotfound|network|socket|fetch failed|abort)\b/i.test(text)) return `${prefix}-${codes.networkTimeout}`;
  if (/\b(lock lost|state lock lost)\b/i.test(msg)) return `${prefix}-${codes.lockLost}`;

  return fallback;
}
