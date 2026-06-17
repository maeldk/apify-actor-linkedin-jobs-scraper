import { describe, it, expect, vi } from 'vitest';
import { classifyTarget, buildRows, buildDigest, exportRecords } from '../mcpExport.js';

describe('classifyTarget', () => {
  it('detects Notion by tool name', () => {
    const r = classifyTarget([{ name: 'notion-create-pages' }, { name: 'search' }]);
    expect(r?.targetClass).toBe('notion');
    expect(r?.tool.name).toBe('notion-create-pages');
  });
  it('detects Slack post_message', () => {
    expect(classifyTarget([{ name: 'slack_post_message' }])?.targetClass).toBe('slack');
  });
  it('detects a sheet/airtable append', () => {
    expect(classifyTarget([{ name: 'append_row' }])?.targetClass).toBe('sheet');
  });
  it('detects an issue-tracker create tool (Linear/Sentry)', () => {
    expect(classifyTarget([{ name: 'create_issue' }])?.targetClass).toBe('issue');
    expect(classifyTarget([{ name: 'linear-create-issue' }])?.targetClass).toBe('issue');
  });
  it('picks create_issue over a read tool sharing the brand (Linear lists list_issues first)', () => {
    const tools = [{ name: 'list_issues' }, { name: 'get_issue' }, { name: 'create_issue' }, { name: 'update_issue' }];
    expect(classifyTarget(tools)?.tool.name).toBe('create_issue');
  });
  it('NO generic fallback: an unknown create tool is NOT selected (safer to no-op than guess)', () => {
    // Previously fell through to a generic create — but calling an unverified tool with flattened lead
    // fields can hit the wrong entity or mutate. We now no-op instead.
    expect(classifyTarget([{ name: 'createRecord' }])).toBeNull();
    expect(classifyTarget([{ name: 'insert' }])).toBeNull(); // e.g. Supabase insert
    expect(classifyTarget([{ name: 'add_item' }])).toBeNull();
  });
  it('denylist: never selects label/comment/database/attachment or update/delete/archive variants', () => {
    expect(classifyTarget([{ name: 'create_issue_label' }])).toBeNull();
    expect(classifyTarget([{ name: 'create_issue_comment' }])).toBeNull();
    expect(classifyTarget([{ name: 'create_attachment' }])).toBeNull();
    expect(classifyTarget([{ name: 'notion-create-database' }])).toBeNull();
    expect(classifyTarget([{ name: 'update_issue' }])).toBeNull();
    expect(classifyTarget([{ name: 'archive_issue' }])).toBeNull();
    // …but the real create tool still wins when present alongside denied variants
    expect(classifyTarget([{ name: 'create_issue_label' }, { name: 'save_issue' }])?.tool.name).toBe('save_issue');
    expect(classifyTarget([{ name: 'notion-create-database' }, { name: 'notion-create-pages' }])?.tool.name).toBe('notion-create-pages');
  });
  it('denylist catches underscore-separated destructive verbs (a \\b boundary missed `_delete`)', () => {
    // these match a create/save rule but the destructive suffix must veto them.
    expect(classifyTarget([{ name: 'save_issue_delete' }])).toBeNull();
    expect(classifyTarget([{ name: 'create_page_remove' }])).toBeNull();
    expect(classifyTarget([{ name: 'record_update' }])).toBeNull();
  });
  it('returns null when nothing writable', () => {
    expect(classifyTarget([{ name: 'search' }, { name: 'list' }])).toBeNull();
  });
  it('Sentry toolset is non-writable: never maps onto update_issue/execute_*/search_* (live-pinned)', () => {
    // Real Sentry connector dump 2026-06-15 — observability tools only, NO create-anything. Mapping lead
    // data onto update_issue would mutate an existing issue; execute_sentry_tool is a meta-executor. none.
    const sentry = ['find_organizations', 'find_projects', 'update_issue', 'search_events',
      'analyze_issue_with_seer', 'search_issues', 'get_sentry_resource', 'search_sentry_tools',
      'execute_sentry_tool'].map((name) => ({ name }));
    expect(classifyTarget(sentry)).toBeNull();
  });
  it('picks the WRITE tool, not a read tool that shares the brand name (regression)', () => {
    // Real Notion server lists read tools first; a bare /notion/ match would wrongly pick notion-search.
    const tools = [{ name: 'notion-search' }, { name: 'notion-fetch' }, { name: 'notion-create-pages' }, { name: 'notion-update-page' }];
    const r = classifyTarget(tools);
    expect(r?.targetClass).toBe('notion');
    expect(r?.tool.name).toBe('notion-create-pages');
  });
});

const REC = {
  title: "Joe's Tacos", categoryName: 'Mexican restaurant', address: '1 Main St',
  contactPhone: '+1 512 000 0000', leadEmail: 'hi@joes.example', website: null,
  totalScore: 4.6, reviewsCount: 210, leadScore: 78, leadTier: 'hot', city: 'Austin',
  mapsUrl: 'https://maps.google.com/?cid=1', location: { lat: 1, lon: 2 }, extractedEmails: [],
};
const COLUMNS: Array<[string, string]> = [
  ['Name', 'title'], ['Category', 'categoryName'], ['Phone', 'contactPhone'],
  ['Email', 'leadEmail'], ['Website', 'website'], ['Lead tier', 'leadTier'],
];

describe('buildRows', () => {
  it('projects only the given columns, skips null/empty, stringifies, never emits nested objects', () => {
    const rows = buildRows([REC], { recordNoun: 'leads', columns: COLUMNS });
    expect(rows[0]).toEqual({
      Name: "Joe's Tacos", Category: 'Mexican restaurant', Phone: '+1 512 000 0000',
      Email: 'hi@joes.example', 'Lead tier': 'hot',
    });
    expect(JSON.stringify(rows[0])).not.toContain('lat');
  });
  it('flattens scalars when no columns given (domain-agnostic default)', () => {
    const rows = buildRows([{ a: 1, b: 'x', c: null, d: { nested: true }, e: [1] }], { recordNoun: 'rows' });
    expect(rows[0]).toEqual({ a: '1', b: 'x' });
  });
});

describe('buildDigest', () => {
  it('summarizes count + context + top-N, deterministic', () => {
    const text = buildDigest([REC], { recordNoun: 'leads', searchTerm: 'taqueria', location: 'Austin, TX' });
    expect(text).toContain('1 leads');
    expect(text).toContain('taqueria');
    expect(text).toContain('Austin, TX');
    expect(text).toContain("Joe's Tacos");
  });
  it('caps the top list at 5 even with more records', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ title: `R${i}` }));
    const text = buildDigest(many, { recordNoun: 'leads' });
    expect(text).toContain('Top 5:');
    expect(text).toContain('5. ');
    expect(text).not.toContain('6. ');
  });
});

const mkClient = (tools: { name: string }[], onCall?: (n: string) => void): any => ({
  listTools: vi.fn().mockResolvedValue({ tools }),
  callTool: vi.fn().mockImplementation(async ({ name }: { name: string }) => { onCall?.(name); }),
});

describe('exportRecords', () => {
  const recs = [{ title: 'A', city: 'X' }, { title: 'B', city: 'Y' }, { title: 'C', city: 'Z' }];

  it('table target: one callTool per row', async () => {
    const c = mkClient([{ name: 'append_row' }]);
    const r = await exportRecords(c, recs, { recordNoun: 'leads' });
    expect(r.targetClass).toBe('sheet');
    expect(r.exported).toBe(3);
    expect(c.callTool).toHaveBeenCalledTimes(3);
  });

  it('slack target: one digest call total', async () => {
    const c = mkClient([{ name: 'slack_post_message' }]);
    const r = await exportRecords(c, recs, { recordNoun: 'leads', searchTerm: 't' });
    expect(r.targetClass).toBe('slack');
    expect(c.callTool).toHaveBeenCalledTimes(1);
    expect(c.callTool.mock.calls[0][0].arguments.text).toContain('3 leads');
  });

  it('respects maxExportRows cap', async () => {
    const c = mkClient([{ name: 'create_page' }]);
    const r = await exportRecords(c, recs, { recordNoun: 'leads', maxExportRows: 2 });
    expect(r.exported).toBe(2);
    expect(r.skipped).toBe(1);
  });

  it('per-row error tolerance (sheet/generic): one bad row does not abort the rest', async () => {
    const c: any = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'append_row' }] }),
      callTool: vi.fn().mockImplementationOnce(() => { throw new Error('boom'); }).mockResolvedValue(undefined),
    };
    const r = await exportRecords(c, recs, { recordNoun: 'leads' });
    expect(r.errors).toBe(1);
    expect(r.exported).toBe(2);
  });

  it('notion target: ONE batched create-pages call with a {pages:[{properties:{title},content}]} table', async () => {
    const c = mkClient([{ name: 'notion-create-pages' }, { name: 'notion-search' }]);
    const r = await exportRecords(c, recs, { recordNoun: 'leads', searchTerm: 'taqueria', location: 'Austin, TX' });
    expect(r.targetClass).toBe('notion');
    expect(r.exported).toBe(3);
    expect(c.callTool).toHaveBeenCalledTimes(1);
    const args = c.callTool.mock.calls[0][0].arguments;
    expect(Array.isArray(args.pages)).toBe(true);
    expect(args.pages).toHaveLength(1);
    expect(args.pages[0].properties.title).toContain('taqueria');
    expect(args.pages[0].properties.title).toContain('Austin, TX');
    expect(args.pages[0].content).toContain('|'); // markdown table
    expect(args.pages[0].content).toContain('A');  // a row value
  });

  it('issue target: ONE create_issue call with {title, description(markdown table)}', async () => {
    const c = mkClient([{ name: 'list_issues' }, { name: 'create_issue' }]);
    const r = await exportRecords(c, recs, { recordNoun: 'leads', searchTerm: 'taqueria', location: 'Austin, TX' });
    expect(r.targetClass).toBe('issue');
    expect(r.exported).toBe(3);
    expect(c.callTool).toHaveBeenCalledTimes(1);
    const args = c.callTool.mock.calls[0][0].arguments;
    expect(args.title).toContain('taqueria');
    expect(args.title).toContain('Austin, TX');
    expect(args.description).toContain('|'); // markdown table body
    expect(args.description).toContain('A'); // a row value
    expect('team' in args).toBe(false); // omitted when not provided
  });

  it('issue target: picks Linear save_issue (upsert), never create_issue_label/update_issue', async () => {
    // Real Linear dump 2026-06-15: no create_issue; save_issue is the create-or-update tool. The label
    // tool and Sentry's update_issue must NOT be selected.
    const linear = ['get_issue', 'list_issues', 'save_issue', 'create_issue_label', 'save_comment', 'update_issue']
      .map((name) => ({ name }));
    const c = mkClient(linear);
    const r = await exportRecords(c, recs, { recordNoun: 'leads' });
    expect(r.targetClass).toBe('issue');
    expect(c.callTool.mock.calls[0][0].name).toBe('save_issue');
  });

  it('issue target: sends `team` (name or id) when ctx.issueTeam is set (Linear save_issue param)', async () => {
    const c = mkClient([{ name: 'save_issue' }]);
    const r = await exportRecords(c, recs, { recordNoun: 'leads', issueTeam: 'Growth' });
    expect(r.exported).toBe(3);
    expect(c.callTool.mock.calls[0][0].arguments.team).toBe('Growth');
  });

  it('issue target: tool-level isError counts as error not export', async () => {
    const c: any = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'save_issue' }] }),
      callTool: vi.fn().mockResolvedValue({ isError: true }),
    };
    const r = await exportRecords(c, recs, { recordNoun: 'leads' });
    expect(r.targetClass).toBe('issue');
    expect(r.exported).toBe(0);
    expect(r.errors).toBe(1);
  });

  it('slack target: includes channel when ctx.slackChannel is set', async () => {
    const c = mkClient([{ name: 'slack_post_message' }]);
    await exportRecords(c, recs, { recordNoun: 'leads', slackChannel: '#leads' });
    expect(c.callTool.mock.calls[0][0].arguments.channel).toBe('#leads');
  });

  it('counts a tool-level isError result as an error, not an export (notion)', async () => {
    const c: any = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'notion-create-pages' }] }),
      callTool: vi.fn().mockResolvedValue({ isError: true, content: [{ type: 'text', text: 'missing pages' }] }),
    };
    const r = await exportRecords(c, recs, { recordNoun: 'leads' });
    expect(r.targetClass).toBe('notion');
    expect(r.exported).toBe(0);
    expect(r.errors).toBe(1);
  });

  it('counts isError per row for sheet/generic targets', async () => {
    const c: any = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'append_row' }] }),
      callTool: vi.fn()
        .mockResolvedValueOnce({ isError: true })
        .mockResolvedValue({ content: [] }),
    };
    const r = await exportRecords(c, recs, { recordNoun: 'leads' });
    expect(r.exported).toBe(2);
    expect(r.errors).toBe(1);
  });

  it('no writable tool: exports nothing, no throw', async () => {
    const c = mkClient([{ name: 'search' }]);
    const r = await exportRecords(c, recs, { recordNoun: 'leads' });
    expect(r.targetClass).toBe('none');
    expect(r.exported).toBe(0);
  });

  it('listTools throwing is swallowed', async () => {
    const c: any = { listTools: vi.fn().mockRejectedValue(new Error('x')), callTool: vi.fn() };
    const r = await exportRecords(c, recs, { recordNoun: 'leads' });
    expect(r.exported).toBe(0);
    expect(r.errors).toBe(1);
  });

  it('malformed listTools shape ({tools:{}}) never throws', async () => {
    const c: any = { listTools: vi.fn().mockResolvedValue({ tools: { nope: true } }), callTool: vi.fn() };
    const r = await exportRecords(c, recs, { recordNoun: 'leads' });
    expect(r.targetClass).toBe('none'); // non-array tools → treated as empty, no throw
    expect(c.callTool).not.toHaveBeenCalled();
  });

  it('non-array records never throws', async () => {
    const c = mkClient([{ name: 'notion-create-pages' }]);
    const r = await exportRecords(c, undefined as any, { recordNoun: 'leads' });
    expect(r.exported).toBe(0);
    expect(r.skipped).toBe(0);
  });

  it('undefined ctx never throws (defensive default)', async () => {
    const c = mkClient([{ name: 'notion-create-pages' }]);
    const r = await exportRecords(c, [{ title: 'A' }], undefined as any);
    expect(r.targetClass).toBe('notion'); // ctx defaulted, still exports
    expect(r.exported).toBe(1);
  });

  it('sanitizes scraped cell content (pipes, newlines, backticks, links, control chars, length cap)', async () => {
    const PIPE = '|', NL = String.fromCharCode(10), BT = String.fromCharCode(96), BEL = String.fromCharCode(7);
    const title = 'A' + PIPE + 'B' + NL + 'C ' + BT + 'code' + BT + ' [link](x)' + BEL;
    const c = mkClient([{ name: 'notion-create-pages' }]);
    await exportRecords(c, [{ title, city: 'X'.repeat(500) }], { recordNoun: 'leads' });
    const content: string = c.callTool.mock.calls[0][0].arguments.pages[0].content;
    expect(content).toContain('A' + '\\' + PIPE + 'B'); // pipe escaped, not a new column
    expect(content).not.toContain(BT);                  // backticks neutralized
    expect(content).not.toContain('[link]');            // link syntax neutralized
    expect(content).not.toContain(BEL);                 // control char stripped
    const rowLine = content.split(NL).find((l) => l.includes('XXXX')) ?? '';
    expect(rowLine.includes(String.fromCharCode(0x2026))).toBe(true); // long cell capped
    expect(rowLine.startsWith('| ')).toBe(true);        // still one well-formed row
  });

  it('escapes column LABELS so a pipe in a label cannot desync columns', async () => {
    const c = mkClient([{ name: 'notion-create-pages' }]);
    await exportRecords(c, [{ a: '1' }], { recordNoun: 'x', columns: [['Pipe | Label', 'a']] });
    const content: string = c.callTool.mock.calls[0][0].arguments.pages[0].content;
    const lines = content.split(String.fromCharCode(10));
    const cols = (s: string) => s.split(/(?<!\\)\|/).length; // split on UNescaped pipes only
    expect(cols(lines[0])).toBe(cols(lines[1])); // header vs separator: same column count
    expect(cols(lines[0])).toBe(cols(lines[2])); // header vs data row: same column count
    expect(cols(lines[0])).toBe(3);              // exactly one data column (+ leading/trailing empty)
  });

  it('cleanTitle caps by code point — no lone surrogate in a long unicode title (R2)', async () => {
    const c = mkClient([{ name: 'notion-create-pages' }]);
    const term = 'a'.repeat(192) + String.fromCodePoint(0x1f600) + 'tail'; // emoji straddles the UTF-16 cap
    await exportRecords(c, [{ title: 'X' }], { recordNoun: 'leads', searchTerm: term });
    const title: string = c.callTool.mock.calls[0][0].arguments.pages[0].properties.title;
    const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(title);
    expect(lone).toBe(false);
  });

  it('truncates long cells by code point — no lone surrogate in output', async () => {
    const c = mkClient([{ name: 'notion-create-pages' }]);
    const cell = 'a'.repeat(298) + String.fromCodePoint(0x1f600) + 'b'.repeat(20); // emoji straddles the cap
    await exportRecords(c, [{ v: cell }], { recordNoun: 'x', columns: [['V', 'v']] });
    const content: string = c.callTool.mock.calls[0][0].arguments.pages[0].content;
    const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(content);
    expect(lone).toBe(false);
  });

  it('empty records with a table target: no calls, clean result', async () => {
    const c = mkClient([{ name: 'append_row' }]);
    const r = await exportRecords(c, [], { recordNoun: 'leads' });
    expect(r).toEqual({ exported: 0, errors: 0, skipped: 0, targetClass: 'sheet' });
    expect(c.callTool).not.toHaveBeenCalled();
  });
});
