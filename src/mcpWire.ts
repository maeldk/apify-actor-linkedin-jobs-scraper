// Fleet-wide MCP connector export helper. Domain-agnostic and NEVER-THROWS: any actor's main.ts can call
// wireMcpExport(...) in one line to write its results into a user's connected app (opt-in via a connectorId).
//
// Separation of concerns:
//   - mcpExport.ts owns the PURE mapping (classify target, build rows/table, call the tool, count results).
//   - this module owns ONLY the SDK connect/close glue. The SDK is dynamic-imported INSIDE defaultConnect,
//     so the module is importable in the pure vitest harness and the never-throws / opt-in contract IS unit-
//     tested by injecting `connect`. It does NOT touch Apify/KV/diag — the caller owns idempotency + telemetry.
//
// Execution is OPT-IN: with no connectorId (or no proxy URL, or no records) it is a clean no-op. The input
// field can therefore ship by default on every actor without changing behavior until a user selects a connector.

import { exportRecords, type McpClientLike, type ExportCtx, type ExportResult } from './mcpExport.js';

export interface McpWireOpts {
  records: Record<string, unknown>[];
  /** Opt-in: empty/undefined → no-op. The user-selected MCP connector id. */
  connectorId?: string;
  /** Apify MCP proxy base URL (process.env.APIFY_MCP_PROXY_URL). Absent → no-op. */
  proxyUrl?: string;
  /** Apify run token (process.env.APIFY_TOKEN). */
  token?: string;
  clientName?: string;
  recordNoun: string;
  searchTerm?: string;
  location?: string;
  columns?: Array<[string, string]>;
  issueTeam?: string;
  slackChannel?: string;
  maxRows?: number;
  /** Optional opaque progress logger (OPSEC: pass the actor's log; messages stay generic). */
  logger?: { info: (m: string) => void };
  /** Test/override seam: supply a connected client instead of the real SDK transport. */
  connect?: (url: string, token: string, name: string) => Promise<{ client: McpClientLike; close: () => Promise<void> }>;
}

const NOOP: ExportResult = { exported: 0, errors: 0, skipped: 0, targetClass: 'none' };

async function defaultConnect(url: string, token: string, name: string): Promise<{ client: McpClientLike; close: () => Promise<void> }> {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
  const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
  const client = new Client({ name, version: '1.0.0' });
  try {
    await client.connect(transport);
  } catch (e) {
    // connect may open transport resources before rejecting → close before propagating (no leak).
    try { await client.close(); } catch { /* best-effort */ }
    throw e;
  }
  return { client: client as unknown as McpClientLike, close: () => client.close() };
}

/**
 * Connect to the user's MCP connector and export `records`. Always resolves to an ExportResult — every
 * failure (no connector, SDK import, connect, list/call, close, bad URL) is swallowed into {errors} so a
 * failing connector can NEVER fail a paid run. The caller decides what to do with the result (diag, mark
 * idempotent, etc.).
 */
export async function wireMcpExport(opts: McpWireOpts): Promise<ExportResult> {
  if (!opts || !opts.connectorId || !opts.proxyUrl || !Array.isArray(opts.records) || opts.records.length === 0) return NOOP;
  const token = opts.token ?? '';
  const url = `${opts.proxyUrl}/${opts.connectorId}`;
  let close: (() => Promise<void>) | undefined;
  try {
    const connector = (opts.connect ?? defaultConnect);
    const connected = await connector(url, token, opts.clientName ?? 'apify-actor');
    close = connected.close;
    const ctx: ExportCtx = {
      recordNoun: opts.recordNoun,
      searchTerm: opts.searchTerm,
      location: opts.location,
      columns: opts.columns,
      issueTeam: opts.issueTeam,
      slackChannel: opts.slackChannel,
      maxExportRows: opts.maxRows,
    };
    const res = await exportRecords(connected.client, opts.records, ctx);
    if (opts.logger) {
      // Opaque BUT accurate (OPSEC + honesty): never read as success when the app rejected the write.
      // Isolated try/catch — a throwing logger must NEVER turn a successful export into a recorded failure
      // (which would also suppress the caller's idempotency marker → a duplicate on resume).
      try {
        if (res.errors > 0) opts.logger.info(`Connected-app export finished with ${res.errors} app error(s); ${res.exported} sent.`);
        else if (res.exported > 0) opts.logger.info(`Sent ${res.exported} ${opts.recordNoun} to your connected app.`);
        else opts.logger.info('Connected app had no compatible destination; nothing exported.');
      } catch { /* logging never alters the result */ }
    }
    return res;
  } catch {
    return { exported: 0, errors: 1, skipped: 0, targetClass: 'none' };
  } finally {
    try { await close?.(); } catch { /* best-effort */ }
  }
}
