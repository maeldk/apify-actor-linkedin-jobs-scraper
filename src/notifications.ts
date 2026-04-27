/**
 * Notification integrations — Telegram, Discord, Slack.
 *
 * Generic, brand-agnostic. All three platforms are opt-in. When more than one
 * is configured they fire in parallel; a failure on one platform does not
 * affect the others.
 *
 * Uses native fetch (Node 22+) — no extra dependencies.
 *
 * Canonical source: _lib/notifications.ts. Copy to each actor's src/.
 *
 * Usage:
 *   import { sendAllNotifications, selectItemsToNotify } from './notifications.js';
 *   const items = selectItemsToNotify(outputItems, notifyOnlyChanges, incrementalMode);
 *   const { sent, failed } = await sendAllNotifications(config, items, metadata);
 *
 * Output items must conform to NotificationItem. If your OutputItem is a
 * superset, pass it directly — TypeScript structural typing matches.
 */

export interface NotificationItem {
  title: string | null;
  company: string | null;
  location: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  description: string | null;
  applyUrl: string | null;
  /** ISO-8601 timestamp of when the listing was posted. */
  postedAt: string | null;
  /** Optional — incremental change classification. */
  changeType?: string | null;
  /** Optional — employment type / contract type for richer formatting. */
  employmentType?: string | null;
  /** Optional — job category / industry for richer formatting. */
  category?: string | null;
}

export interface NotificationConfig {
  telegramToken: string | null;
  telegramChatId: string | null;
  discordWebhookUrl: string | null;
  slackWebhookUrl: string | null;
  /** WhatsApp Cloud API permanent access token (System User token from Meta Business). */
  whatsappAccessToken?: string | null;
  /** WhatsApp Business phone-number ID (numeric, from Meta dashboard). */
  whatsappPhoneNumberId?: string | null;
  /** Recipient phone in E.164 format (e.g. "436641234567"). User must have messaged the
   *  business number within the last 24h, otherwise Meta rejects free-form text and only
   *  pre-approved templates work — we do not send templates from this module. */
  whatsappTo?: string | null;
  /** Generic webhook URL — receives a JSON POST with full payload + metadata. Universal
   *  escape hatch for n8n / Make / Zapier / custom backends. */
  webhookUrl?: string | null;
  /** Optional headers (e.g. authorization) sent with the webhook POST. */
  webhookHeaders?: Record<string, string> | null;
  notificationLimit: number;
  includeRunMetadata: boolean;
}

export interface RunMetadata {
  /** Free-form label shown in notification headers, e.g. "Willhaben: developer · Wien". */
  searchLabel: string;
  totalEmitted: number;
  runAt?: string;
  /** Optional link to the dataset for the run (some actors include this in notifications). */
  datasetUrl?: string;
}

// ── Formatters ──────────────────────────────────────────────────────────

const CURRENCY_PREFIX: Record<string, string> = {
  USD: '$', GBP: '£', EUR: '€',
  AUD: 'A$', CAD: 'C$', NZD: 'NZ$',
  CHF: 'CHF ', INR: '₹', PLN: 'zł',
  BRL: 'R$', MXN: 'MX$', SGD: 'S$', ZAR: 'R',
  SEK: 'kr ', DKK: 'kr ', NOK: 'kr ',
};

function fmtMoney(amount: number | null, currency: string | null): string {
  if (amount === null) return '—';
  const prefix = currency
    ? (CURRENCY_PREFIX[currency] ?? `${currency} `)
    : '$';
  return `${prefix}${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function fmtSalaryRange(item: NotificationItem): string | null {
  if (item.salaryMin === null && item.salaryMax === null) return null;
  const cur = item.salaryCurrency;
  if (item.salaryMin !== null && item.salaryMax !== null && item.salaryMin !== item.salaryMax) {
    return `${fmtMoney(item.salaryMin, cur)}–${fmtMoney(item.salaryMax, cur)}`;
  }
  return fmtMoney(item.salaryMax ?? item.salaryMin, cur);
}

/** Escape Markdown V1 special chars: _ * [ ] ` */
function escapeMarkdown(s: string): string {
  return s.replace(/[_*[\]`]/g, '\\$&');
}

function jobOneLiner(item: NotificationItem, escape?: (s: string) => string): string {
  const e = escape ?? ((s) => s);
  const parts: string[] = [];
  if (item.company) parts.push(e(item.company));
  const salary = fmtSalaryRange(item);
  if (salary) parts.push(salary);
  if (item.location) parts.push(e(item.location));
  if (item.employmentType) parts.push(e(item.employmentType));
  if (item.category) parts.push(e(item.category));
  if (item.changeType && item.changeType !== 'UNCHANGED') parts.push(`[${item.changeType}]`);
  return parts.join(' · ');
}

export function formatTelegram(items: NotificationItem[], metadata: RunMetadata | null): string {
  const lines: string[] = [];
  if (metadata) {
    lines.push(`📊 *${escapeMarkdown(metadata.searchLabel)} — ${metadata.totalEmitted} result(s)*`);
    lines.push('');
  }
  for (const item of items) {
    const title = escapeMarkdown(item.title ?? '(untitled)');
    lines.push(`*${title}*`);
    const oneliner = jobOneLiner(item, escapeMarkdown);
    if (oneliner) lines.push(oneliner);
    if (item.applyUrl) lines.push(item.applyUrl);
    lines.push('');
  }
  return lines.join('\n').trim();
}

interface DiscordEmbed {
  title: string;
  url?: string;
  description?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
}

export function formatDiscord(items: NotificationItem[], metadata: RunMetadata | null): { content: string; embeds: DiscordEmbed[] } {
  const embeds: DiscordEmbed[] = items.map(item => {
    const fields: NonNullable<DiscordEmbed['fields']> = [];
    if (item.company) fields.push({ name: 'Company', value: item.company, inline: true });
    const salary = fmtSalaryRange(item);
    if (salary) fields.push({ name: 'Salary', value: salary, inline: true });
    if (item.location) fields.push({ name: 'Location', value: item.location, inline: true });
    if (item.employmentType) fields.push({ name: 'Type', value: item.employmentType, inline: true });
    if (item.category) fields.push({ name: 'Category', value: item.category, inline: true });

    const desc = item.description?.slice(0, 300);
    const color = item.changeType === 'NEW' ? 0x22c55e : item.changeType === 'UPDATED' ? 0xf59e0b : 0x3b82f6;

    return {
      title: (item.title ?? '(untitled)').slice(0, 256),
      url: item.applyUrl || undefined,
      description: desc ? desc + (item.description!.length > 300 ? '…' : '') : undefined,
      color,
      fields,
      footer: item.postedAt ? { text: `Posted ${item.postedAt.slice(0, 10)}` } : undefined,
    };
  });

  const content = metadata ? `📊 **${metadata.searchLabel}** — ${metadata.totalEmitted} result(s)` : '';
  return { content, embeds };
}

interface SlackBlock {
  type: string;
  text?: { type: string; text: string };
}

/** Escape Slack mrkdwn special chars: < > & */
function escapeSlack(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function formatSlack(items: NotificationItem[], metadata: RunMetadata | null): { blocks: SlackBlock[] } {
  const blocks: SlackBlock[] = [];
  if (metadata) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `📊 *${escapeSlack(metadata.searchLabel)}* — ${metadata.totalEmitted} result(s)` } });
    blocks.push({ type: 'divider' });
  }
  for (const item of items) {
    const url = item.applyUrl;
    const title = escapeSlack(item.title ?? '(untitled)');
    const linkedTitle = url ? `<${url}|${title}>` : title;
    const oneliner = jobOneLiner(item, escapeSlack);
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*${linkedTitle}*${oneliner ? `\n${oneliner}` : ''}` } });
  }
  return { blocks };
}

// ── Senders ─────────────────────────────────────────────────────────────

async function postJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} from ${url.split('?')[0]}: ${text.slice(0, 200)}`);
  }
}

export async function sendTelegram(token: string, chatId: string, text: string): Promise<void> {
  await postJson(`https://api.telegram.org/bot${token}/sendMessage`, {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
    disable_web_page_preview: false,
  });
}

export async function sendDiscord(webhookUrl: string, payload: { content: string; embeds: DiscordEmbed[] }): Promise<void> {
  // Discord caps at 10 embeds per message
  const batches: DiscordEmbed[][] = [];
  for (let i = 0; i < payload.embeds.length; i += 10) batches.push(payload.embeds.slice(i, i + 10));
  for (let i = 0; i < Math.max(batches.length, 1); i++) {
    await postJson(webhookUrl, { content: i === 0 ? payload.content : '', embeds: batches[i] ?? [] });
  }
}

export async function sendSlack(webhookUrl: string, payload: { blocks: SlackBlock[] }): Promise<void> {
  await postJson(webhookUrl, payload);
}

/**
 * Format items as a plain-text WhatsApp message (no Markdown — WhatsApp's text format
 * uses *bold* / _italic_ but is brittle; we keep it plain to avoid encoding issues).
 */
export function formatWhatsApp(items: NotificationItem[], metadata: RunMetadata | null): string {
  const lines: string[] = [];
  if (metadata) {
    lines.push(`📊 ${metadata.searchLabel} — ${metadata.totalEmitted} result(s)`);
    lines.push('');
  }
  for (const item of items) {
    lines.push(item.title ?? '(untitled)');
    const oneliner = jobOneLiner(item);
    if (oneliner) lines.push(oneliner);
    if (item.applyUrl) lines.push(item.applyUrl);
    lines.push('');
  }
  return lines.join('\n').trim();
}

/**
 * Send a generic JSON webhook with full item array + metadata. Universal hook for
 * n8n / Make / Zapier / custom HTTP backends. Optional custom headers are merged
 * with Content-Type: application/json. Single request — no chunking, no retry.
 */
export async function sendWebhook(
  webhookUrl: string,
  items: NotificationItem[],
  metadata: RunMetadata | null,
  customHeaders?: Record<string, string> | null,
): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (customHeaders) {
    for (const [k, v] of Object.entries(customHeaders)) headers[k] = v;
  }
  const payload = {
    metadata: metadata ?? null,
    items,
  };
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} from webhook: ${t.slice(0, 200)}`);
  }
}

/**
 * Send a free-form text message via WhatsApp Cloud API.
 *
 * Constraints:
 *   - Recipient must have messaged the business number within the last 24h, otherwise
 *     Meta rejects with errcode 131047 ("Re-engagement message"). For initiation-style
 *     alerts (no prior conversation), use a pre-approved template — not done here.
 *   - Text payload max 4096 chars; longer messages are split.
 *   - 2026 service-conversation pricing: free since Nov 1, 2024 within 24h window.
 */
export async function sendWhatsApp(accessToken: string, phoneNumberId: string, to: string, text: string): Promise<void> {
  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  const MAX_LEN = 4096;
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += MAX_LEN) parts.push(text.slice(i, i + MAX_LEN));
  for (const part of parts) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: part, preview_url: true },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} from graph.facebook.com: ${errText.slice(0, 300)}`);
    }
  }
}

// ── Item selection ──────────────────────────────────────────────────────

export function selectItemsToNotify<T extends NotificationItem>(
  items: T[],
  notifyOnlyChanges: boolean,
  incrementalMode: boolean,
): T[] {
  if (notifyOnlyChanges && incrementalMode) {
    return items.filter(i => i.changeType === 'NEW' || i.changeType === 'UPDATED');
  }
  return items;
}

// ── Top-level dispatcher ────────────────────────────────────────────────

export async function sendAllNotifications(
  config: NotificationConfig,
  items: NotificationItem[],
  metadata: RunMetadata | null,
): Promise<{ sent: string[]; failed: Array<{ platform: string; error: string }> }> {
  const sent: string[] = [];
  const failed: Array<{ platform: string; error: string }> = [];
  const limited = items.slice(0, config.notificationLimit);
  if (limited.length === 0) return { sent, failed };

  const meta = config.includeRunMetadata ? metadata : null;
  const tasks: Array<{ platform: string; fn: () => Promise<void> }> = [];

  if (config.telegramToken && config.telegramChatId) {
    tasks.push({ platform: 'telegram', fn: () => sendTelegram(config.telegramToken!, config.telegramChatId!, formatTelegram(limited, meta)) });
  }
  if (config.discordWebhookUrl) {
    tasks.push({ platform: 'discord', fn: () => sendDiscord(config.discordWebhookUrl!, formatDiscord(limited, meta)) });
  }
  if (config.slackWebhookUrl) {
    tasks.push({ platform: 'slack', fn: () => sendSlack(config.slackWebhookUrl!, formatSlack(limited, meta)) });
  }
  if (config.whatsappAccessToken && config.whatsappPhoneNumberId && config.whatsappTo) {
    tasks.push({
      platform: 'whatsapp',
      fn: () => sendWhatsApp(
        config.whatsappAccessToken!,
        config.whatsappPhoneNumberId!,
        config.whatsappTo!,
        formatWhatsApp(limited, meta),
      ),
    });
  }
  if (config.webhookUrl) {
    tasks.push({
      platform: 'webhook',
      fn: () => sendWebhook(config.webhookUrl!, limited, meta, config.webhookHeaders ?? null),
    });
  }

  const results = await Promise.allSettled(tasks.map(t => t.fn()));
  for (let i = 0; i < tasks.length; i++) {
    const r = results[i]!;
    if (r.status === 'fulfilled') sent.push(tasks[i]!.platform);
    else failed.push({ platform: tasks[i]!.platform, error: r.reason instanceof Error ? r.reason.message : String(r.reason) });
  }
  return { sent, failed };
}
