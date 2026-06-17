import { describe, it, expect, vi } from 'vitest';
import { wireMcpExport } from '../mcpWire.js';

const recs = [{ title: 'A', city: 'X' }, { title: 'B', city: 'Y' }];

// A fake connected client: notion-create-pages target, records the calls.
const fakeConnect = (tools: { name: string }[], onClose?: () => void) =>
  async () => ({
    client: {
      listTools: vi.fn().mockResolvedValue({ tools }),
      callTool: vi.fn().mockResolvedValue({}),
    } as any,
    close: async () => { onClose?.(); },
  });

describe('wireMcpExport (opt-in)', () => {
  it('no connectorId → clean no-op, never connects', async () => {
    const connect = vi.fn();
    const r = await wireMcpExport({ records: recs, recordNoun: 'leads', proxyUrl: 'http://p', connect });
    expect(r).toEqual({ exported: 0, errors: 0, skipped: 0, targetClass: 'none' });
    expect(connect).not.toHaveBeenCalled();
  });

  it('no proxyUrl → no-op (env not injected yet)', async () => {
    const connect = vi.fn();
    const r = await wireMcpExport({ records: recs, recordNoun: 'leads', connectorId: 'c1', connect });
    expect(r.targetClass).toBe('none');
    expect(connect).not.toHaveBeenCalled();
  });

  it('empty records → no-op', async () => {
    const connect = vi.fn();
    const r = await wireMcpExport({ records: [], recordNoun: 'leads', connectorId: 'c1', proxyUrl: 'http://p', connect });
    expect(r.exported).toBe(0);
    expect(connect).not.toHaveBeenCalled();
  });

  it('undefined opts → NOOP, never throws', async () => {
    const r = await wireMcpExport(undefined as any);
    expect(r).toEqual({ exported: 0, errors: 0, skipped: 0, targetClass: 'none' });
  });
});

describe('wireMcpExport (active)', () => {
  it('connects, exports via exportRecords, returns its result', async () => {
    const r = await wireMcpExport({
      records: recs, recordNoun: 'leads', connectorId: 'c1', proxyUrl: 'http://p',
      connect: fakeConnect([{ name: 'notion-create-pages' }]),
    });
    expect(r.targetClass).toBe('notion');
    expect(r.exported).toBe(2);
  });

  it('builds the proxy URL from proxyUrl + connectorId', async () => {
    let seenUrl = '';
    await wireMcpExport({
      records: recs, recordNoun: 'leads', connectorId: 'CONN', proxyUrl: 'https://proxy.example',
      connect: async (url) => { seenUrl = url; return { client: { listTools: async () => ({ tools: [] }), callTool: async () => ({}) } as any, close: async () => {} }; },
    });
    expect(seenUrl).toBe('https://proxy.example/CONN');
  });

  it('always closes the client (finally)', async () => {
    const onClose = vi.fn();
    await wireMcpExport({
      records: recs, recordNoun: 'leads', connectorId: 'c1', proxyUrl: 'http://p',
      connect: fakeConnect([{ name: 'notion-create-pages' }], onClose),
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('connect throwing is swallowed → errors:1, never throws', async () => {
    const r = await wireMcpExport({
      records: recs, recordNoun: 'leads', connectorId: 'c1', proxyUrl: 'http://p',
      connect: async () => { throw new Error('connect failed'); },
    });
    expect(r).toEqual({ exported: 0, errors: 1, skipped: 0, targetClass: 'none' });
  });

  it('closes even when exportRecords path errors mid-way', async () => {
    const onClose = vi.fn();
    const r = await wireMcpExport({
      records: recs, recordNoun: 'leads', connectorId: 'c1', proxyUrl: 'http://p',
      connect: async () => ({
        client: { listTools: async () => { throw new Error('boom'); }, callTool: async () => ({}) } as any,
        close: async () => { onClose(); },
      }),
    });
    // exportRecords swallows the listTools throw → errors:1, and we still closed.
    expect(r.errors).toBe(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a throwing logger never turns a successful export into a failure (R1)', async () => {
    const r = await wireMcpExport({
      records: recs, recordNoun: 'leads', connectorId: 'c1', proxyUrl: 'http://p',
      logger: { info: () => { throw new Error('log boom'); } },
      connect: fakeConnect([{ name: 'notion-create-pages' }]),
    });
    expect(r.targetClass).toBe('notion');
    expect(r.exported).toBe(2);
    expect(r.errors).toBe(0); // logger throw must NOT corrupt the result (else idempotency marker skipped)
  });

  it('logger is opaque + accurate: app error is not reported as success', async () => {
    const msgs: string[] = [];
    await wireMcpExport({
      records: recs, recordNoun: 'leads', connectorId: 'c1', proxyUrl: 'http://p',
      logger: { info: (m) => msgs.push(m) },
      connect: async () => ({
        client: { listTools: async () => ({ tools: [{ name: 'save_issue' }] }), callTool: async () => ({ isError: true }) } as any,
        close: async () => {},
      }),
    });
    expect(msgs.join(' ')).toMatch(/app error/i);
    expect(msgs.join(' ')).not.toMatch(/\bSent 0\b/);
  });
});
