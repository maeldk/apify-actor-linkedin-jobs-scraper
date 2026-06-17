// Deterministic, domain-agnostic export of flat records to a connected MCP server
// (Notion / Slack / Sheets / Airtable / any). PURE: the MCP client is injected, so all
// logic is unit-testable without @modelcontextprotocol/sdk. The SDK is wired only in the
// actor layer (gmapsActorMain). Failures here must never bubble — callers swallow.

export interface McpTool { name: string; description?: string; inputSchema?: unknown }
export interface McpClientLike {
  listTools(): Promise<{ tools: McpTool[] }>;
  callTool(args: { name: string; arguments: Record<string, unknown> }): Promise<unknown>;
}

export type TargetClass = 'notion' | 'sheet' | 'slack' | 'issue' | 'generic';

// First-match-wins ordering is intentional priority: more specific targets win over generic.
// Match the WRITE/create tool, not the brand: a bare /notion/ or /slack/ matches read tools
// (notion-search, notion-fetch) which appear first in listTools and would be wrongly selected.
// Each rule is pinned to a VERIFIED adapter family — `notion-create-pages`, a sheet append, a slack
// post, an issue-tracker create. There is deliberately NO generic catch-all: selecting an unverified
// tool (a Supabase `insert`, a `create_issue_label`, an `archive_issue`) and calling it with flattened
// lead fields is worse than not exporting. Unknown connector → no-op.
const TARGET_RULES: Array<[TargetClass, RegExp]> = [
  ['notion', /create[-_ ]?pages?/i],
  ['sheet', /append[-_ ]?row|add[-_ ]?row|insert[-_ ]?row|append[-_ ]?values/i],
  ['slack', /post[-_ ]?message|send[-_ ]?message|chat[._ ]?post/i],
  // Issue trackers (Linear `save_issue` upsert / others `create_issue`): ONE summary issue per run
  // (title + markdown-table body), mirroring the Notion v1 decision — robust without per-record field
  // config, never spams the tracker. The trailing \b rejects `create_issue_label` (a LABEL, not an
  // issue — "issue_label" has no word boundary after "issue"); `save|create|new` excludes Sentry's
  // `update_issue` so we never MUTATE an existing issue.
  ['issue', /\b(?:create|save|new)[-_ ]?issues?\b/i],
];
// Defense-in-depth: even if a rule matches, never pick a tool that touches the WRONG entity or MUTATES
// — labels, comments, attachments, databases, or update/delete/remove/archive/move/duplicate variants.
// The verb group uses (?<![a-z0-9]) instead of \b so it also catches snake_case separators — `_delete`,
// `record_delete` (a `_` is a word char, so \b would miss it). MCP tool names are snake_case in practice.
const DENY_RE = /label|comment|attachment|database|duplicate|(?<![a-z0-9])(?:update|delete|remove|archive|move)/i;

export function classifyTarget(tools: McpTool[]): { targetClass: TargetClass; tool: McpTool } | null {
  if (!Array.isArray(tools)) return null;
  for (const [cls, re] of TARGET_RULES) {
    const t = tools.find((x) => typeof x?.name === 'string' && re.test(x.name) && !DENY_RE.test(x.name));
    if (t) return { targetClass: cls, tool: t };
  }
  return null;
}

export interface ExportCtx {
  recordNoun: string;
  searchTerm?: string;
  location?: string;
  maxExportRows?: number;
  /** Table projection [label, recordKey]. If absent, scalar-flatten the record. */
  columns?: Array<[string, string]>;
  /** Optional Slack channel (issue/slack targets). Slack's send_message needs `{channel, text}`. */
  slackChannel?: string;
  /** Optional issue-tracker team (name OR id). Linear `save_issue` requires `team` when creating. Omitted when absent. */
  issueTeam?: string;
}

const isScalar = (v: unknown): v is string | number | boolean =>
  // Exclude empty strings: a blank value is treated as absent (skipped from rows/projection).
  (typeof v === 'string' && v !== '') || typeof v === 'number' || typeof v === 'boolean';

export function buildRows(records: Record<string, unknown>[], ctx: ExportCtx): Record<string, string>[] {
  return records.map((rec) => {
    const out: Record<string, string> = {};
    if (ctx.columns) {
      for (const [label, key] of ctx.columns) {
        const v = rec[key];
        if (isScalar(v)) out[label] = String(v);
      }
    } else {
      for (const [k, v] of Object.entries(rec)) if (isScalar(v)) out[k] = String(v);
    }
    return out;
  });
}

export function buildDigest(records: Record<string, unknown>[], ctx: ExportCtx): string {
  const where = ctx.location ? ` in ${ctx.location}` : '';
  const what = ctx.searchTerm ? ` for "${ctx.searchTerm}"` : '';
  const head = `Found ${records.length} ${ctx.recordNoun}${what}${where}.`;
  const top = records.slice(0, 5).map((r, i) => {
    const name = String(r.title ?? r.name ?? 'Result');
    const city = r.city ? ` — ${String(r.city)}` : '';
    const tier = r.leadTier ? ` (${String(r.leadTier)})` : '';
    return `${i + 1}. ${name}${city}${tier}`;
  });
  return top.length ? `${head}\nTop ${top.length}:\n${top.join('\n')}` : head;
}

export interface ExportResult {
  exported: number;
  errors: number;
  skipped: number;
  targetClass: TargetClass | 'none';
}

/** MCP tool results signal tool-level failure via `isError: true` WITHOUT throwing — must be checked. */
function isToolError(result: unknown): boolean {
  return !!(result && typeof result === 'object' && (result as { isError?: unknown }).isError === true);
}

const CELL_MAX = 300; // a scraped name/address can't bloat a cell unbounded
const BODY_MAX = 100_000; // hard cap on the whole table body (Notion/Linear reject very large bodies)
/**
 * Make an arbitrary scraped string safe inside a markdown table cell: strip control chars, collapse
 * whitespace/newlines, neutralize the table delimiter and markdown-active chars (backtick code spans,
 * link/mention brackets) so a business name can't break the table or inject a link/mention, then cap length.
 */
const escCell = (v: string): string => {
  // Strip control chars by code point (no control-char regex literal), then neutralize markdown-active
  // chars so a scraped name can't break the table or inject a link/mention, collapse whitespace, cap length.
  const noCtrl = Array.from(v).filter((c) => { const n = c.charCodeAt(0); return n >= 32 && n !== 127; }).join('');
  const cleaned = noCtrl
    .replace(/`/g, "'")                       // neutralize code spans
    .replace(/\|/g, '\\|')                    // escape the table delimiter
    .replace(/[[\]]/g, (m) => (m === '[' ? '(' : ')')) // neutralize link/mention syntax
    .replace(/\s+/g, ' ')
    .trim();
  // Truncate by CODE POINT (not UTF-16 unit) so an astral char straddling the cap is never split into a
  // lone surrogate (which would be invalid UTF-16 in the payload).
  const cp = Array.from(cleaned);
  return cp.length > CELL_MAX ? `${cp.slice(0, CELL_MAX - 1).join('')}…` : cleaned;
};

/** One-line, control-stripped, code-point-capped title for a page/issue (keep it tidy; no lone surrogate). */
const cleanTitle = (s: string): string => {
  const j = Array.from(s).filter((c) => { const n = c.charCodeAt(0); return n >= 32 && n !== 127; }).join('').replace(/\s+/g, ' ').trim();
  return Array.from(j).slice(0, 200).join(''); // slice by CODE POINT, not UTF-16 unit
};

/** Markdown table from projected rows. Columns = ctx.columns labels (ordered), else the row's own keys. */
function buildMarkdownTable(rows: Record<string, string>[], ctx: ExportCtx): string {
  const labels = ctx.columns ? ctx.columns.map((c) => c[0]) : Object.keys(rows[0] ?? {});
  if (!labels.length) return '';
  // Escape labels for DISPLAY (a pipe in a label would desync columns); keep the raw label for row lookup.
  const header = `| ${labels.map(escCell).join(' | ')} |`;
  const sep = `| ${labels.map(() => '---').join(' | ')} |`;
  // Append rows until the body cap is hit; truncate at a ROW boundary so the table stays well-formed.
  const lines = [header, sep];
  let size = header.length + sep.length;
  let truncated = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const line = `| ${labels.map((l) => escCell(rows[i][l] ?? '')).join(' | ')} |`;
    if (size + line.length > BODY_MAX) { truncated = rows.length - i; break; }
    lines.push(line);
    size += line.length + 1;
  }
  // Truncation note as a FULL-WIDTH row (one cell per column) so the table stays well-formed under
  // multi-column headers; the note sits in the first cell, the rest are blank.
  if (truncated > 0) lines.push(`| ${[`…and ${truncated} more`, ...Array(Math.max(0, labels.length - 1)).fill('')].join(' | ')} |`);
  return lines.join('\n');
}

/**
 * Notion `create-pages` arg: ONE summary page per run holding a markdown table of all rows.
 * Standalone (no parent) page — works without the user pre-configuring a database. Pinned against the
 * real notion-create-pages inputSchema (requires top-level `pages: [{ properties:{title}, content }]`).
 * Per-database row mirroring (data_source_id + fetched schema) is a v2 enhancement.
 */
function buildNotionPages(rows: Record<string, string>[], ctx: ExportCtx): Record<string, unknown> {
  const title = cleanTitle(`${ctx.recordNoun}${ctx.searchTerm ? `: ${ctx.searchTerm}` : ''}${ctx.location ? ` in ${ctx.location}` : ''}`);
  return { pages: [{ properties: { title }, content: buildMarkdownTable(rows, ctx) }] };
}

/**
 * Issue-tracker create arg: ONE summary issue per run — title + a markdown-table description of all rows.
 * Pinned against Linear's live `save_issue` inputSchema (2026-06-15): `title` + `team` (name OR id) are
 * required when creating; `description` is Markdown. We never pass `id`, so `save_issue` always CREATES
 * (never mutates an existing issue). `team` is omitted only when the user gave none — then a team-requiring
 * server returns isError (counted, opaque). Per-record issue-per-lead is intentionally NOT v1 (spams the
 * tracker, needs per-field config).
 */
function buildIssueArg(rows: Record<string, string>[], ctx: ExportCtx): Record<string, unknown> {
  const title = cleanTitle(`${ctx.recordNoun}${ctx.searchTerm ? `: ${ctx.searchTerm}` : ''}${ctx.location ? ` in ${ctx.location}` : ''}`);
  const arg: Record<string, unknown> = { title, description: buildMarkdownTable(rows, ctx) };
  if (ctx.issueTeam) arg.team = ctx.issueTeam;
  return arg;
}

/** Per-row arg for sheet targets (the only multi-row class; best-effort, verify against the real server). */
function argForRow(cls: TargetClass, row: Record<string, string>): Record<string, unknown> {
  if (cls === 'sheet') return { row };
  return { ...row };
}

export async function exportRecords(
  client: McpClientLike,
  records: Record<string, unknown>[],
  ctx: ExportCtx,
): Promise<ExportResult> {
  const safeRecords = Array.isArray(records) ? records : [];
  ctx = ctx ?? ({ recordNoun: 'records' } as ExportCtx); // never-throws: tolerate a missing ctx
  const cap = ctx.maxExportRows ?? 500;
  const slice = safeRecords.slice(0, cap);
  const skipped = safeRecords.length - slice.length;

  let tools: McpTool[];
  try {
    const listed = await client.listTools();
    tools = Array.isArray(listed?.tools) ? listed.tools : []; // a malformed {tools:{…}} must not throw later
  } catch {
    return { exported: 0, errors: 1, skipped, targetClass: 'none' };
  }

  // classifyTarget is pure but defend against an unexpected shape — this whole module must never throw.
  let target: ReturnType<typeof classifyTarget>;
  try { target = classifyTarget(tools); } catch { return { exported: 0, errors: 1, skipped, targetClass: 'none' }; }
  if (!target) return { exported: 0, errors: 0, skipped, targetClass: 'none' };

  // Slack: one digest message for the whole run. Slack's send_message expects `{channel, text}`;
  // channel is included only when provided (some workspaces default it on the connector side).
  if (target.targetClass === 'slack') {
    try {
      const slackArgs: Record<string, unknown> = { text: buildDigest(slice, ctx) };
      if (ctx.slackChannel) slackArgs.channel = ctx.slackChannel;
      const r = await client.callTool({ name: target.tool.name, arguments: slackArgs });
      return isToolError(r)
        ? { exported: 0, errors: 1, skipped, targetClass: 'slack' }
        : { exported: slice.length, errors: 0, skipped, targetClass: 'slack' };
    } catch {
      return { exported: 0, errors: 1, skipped, targetClass: 'slack' };
    }
  }

  let rows: Record<string, string>[];
  try {
    rows = buildRows(slice, ctx);
  } catch {
    return { exported: 0, errors: 1, skipped, targetClass: target.targetClass };
  }

  // Notion: ONE batched create-pages call (a single summary page holding a table).
  if (target.targetClass === 'notion') {
    try {
      const r = await client.callTool({ name: target.tool.name, arguments: buildNotionPages(rows, ctx) });
      return isToolError(r)
        ? { exported: 0, errors: 1, skipped, targetClass: 'notion' }
        : { exported: rows.length, errors: 0, skipped, targetClass: 'notion' };
    } catch {
      return { exported: 0, errors: 1, skipped, targetClass: 'notion' };
    }
  }

  // Issue tracker (Linear/Sentry): ONE summary create_issue call (title + markdown-table body).
  if (target.targetClass === 'issue') {
    try {
      const r = await client.callTool({ name: target.tool.name, arguments: buildIssueArg(rows, ctx) });
      return isToolError(r)
        ? { exported: 0, errors: 1, skipped, targetClass: 'issue' }
        : { exported: rows.length, errors: 0, skipped, targetClass: 'issue' };
    } catch {
      return { exported: 0, errors: 1, skipped, targetClass: 'issue' };
    }
  }

  // Sheet / generic: one row per call, per-row error tolerance + tool-level isError check.
  let exported = 0;
  let errors = 0;
  for (const row of rows) {
    try {
      const r = await client.callTool({ name: target.tool.name, arguments: argForRow(target.targetClass, row) });
      if (isToolError(r)) errors += 1;
      else exported += 1;
    } catch {
      errors += 1;
    }
  }
  return { exported, errors, skipped, targetClass: target.targetClass };
}
