/**
 * schemaDrift v2 - source-agnostic detector for fields a data source emits that
 * an actor does not yet map.
 *
 * Core principle (do NOT regress this): drift is measured against what the actor
 * MAPS, never against what the source has sent before. Seeding a baseline from
 * live responses and comparing against it would "learn errors as truth" - an
 * existing-but-unmapped field would be silently accepted. So:
 *
 *   pendingDrift = observed - mappedKnown - acknowledgedIgnored
 *
 * `observedBaseline` is governance/history only (firstSeen/lastSeen/sampleCount,
 * "disappeared" detection). It NEVER suppresses pendingDrift: a new field keeps
 * reporting every run until it is mapped or explicitly acknowledged in code.
 */

export const SCHEMA_DRIFT_MODULE_VERSION = '2.0.1';
export const SCHEMA_BASELINE_VERSION = 1;

export type FieldStatus = 'mapped' | 'ignored' | 'pending';

export interface BaselineField {
    firstSeenAt: string;
    lastSeenAt: string;
    sampleCount: number;
    status: FieldStatus;
}

export interface ObservedBaseline {
    baselineVersion: number;
    moduleVersion: string;
    actor: string;
    scope: string;
    layers: Record<string, { fields: Record<string, BaselineField> }>;
}

export interface PendingField {
    field: string;
    firstSeenAt: string;
    lastSeenAt: string;
    sampleCount: number;
}

export interface SchemaDriftReport {
    pendingDrift: Record<string, PendingField[]>;
    observedBaseline: ObservedBaseline;
    acknowledgedIgnored: Record<string, string[]>;
    disappearedFields: Record<string, string[]>;
    sampled: Record<string, number>;
}

export interface SchemaWatcherOptions {
    actor: string;
    mappedKnown: Record<string, Iterable<string>>;
    acknowledgedIgnored?: Record<string, Iterable<string>>;
    observedBaseline?: ObservedBaseline | null;
    scope?: string;
    nested?: boolean;
    maxPerBucket?: number;
    now?: () => string;
}

export interface SchemaWatcher {
    observe(layer: string, record: unknown): void;
    report(): SchemaDriftReport;
    hasDrift(): boolean;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function createSchemaWatcher(opts: SchemaWatcherOptions): SchemaWatcher {
    const cap = opts.maxPerBucket ?? 500;
    const scope = opts.scope ?? 'default';
    const nowIso = (opts.now ?? (() => new Date().toISOString()))();

    const mapped = new Map<string, Set<string>>();
    for (const [layer, keys] of Object.entries(opts.mappedKnown)) mapped.set(layer, new Set(keys));
    const acked = new Map<string, Set<string>>();
    for (const [layer, keys] of Object.entries(opts.acknowledgedIgnored ?? {})) acked.set(layer, new Set(keys));

    const layers = new Map<string, Map<string, BaselineField>>();
    const prior = opts.observedBaseline;
    if (
        prior
        && prior.baselineVersion === SCHEMA_BASELINE_VERSION
        && prior.actor === opts.actor
        && prior.scope === scope
        && isPlainObject(prior.layers)
    ) {
        for (const [layer, body] of Object.entries(prior.layers)) {
            const fields = new Map<string, BaselineField>();
            for (const [k, f] of Object.entries(body?.fields ?? {})) {
                fields.set(k, { firstSeenAt: f.firstSeenAt, lastSeenAt: f.lastSeenAt, sampleCount: f.sampleCount, status: f.status });
            }
            layers.set(layer, fields);
        }
    }

    const seenThisRun = new Map<string, Set<string>>();
    const sampled = new Map<string, number>();

    const statusOf = (layer: string, key: string): FieldStatus => {
        if (mapped.get(layer)?.has(key)) return 'mapped';
        if (acked.get(layer)?.has(key)) return 'ignored';
        return 'pending';
    };

    const touch = (layer: string, key: string): void => {
        let fields = layers.get(layer);
        if (!fields) { fields = new Map(); layers.set(layer, fields); }
        let seen = seenThisRun.get(layer);
        if (!seen) { seen = new Set(); seenThisRun.set(layer, seen); }
        seen.add(key);
        const existing = fields.get(key);
        if (existing) {
            existing.lastSeenAt = nowIso;
            existing.sampleCount += 1;
        } else {
            if (fields.size >= cap) return;
            fields.set(key, { firstSeenAt: nowIso, lastSeenAt: nowIso, sampleCount: 1, status: statusOf(layer, key) });
        }
    };

    return {
        observe(layer: string, record: unknown): void {
            try {
                if (Array.isArray(record)) { for (const r of record) this.observe(layer, r); return; }
                if (!isPlainObject(record)) return;
                sampled.set(layer, (sampled.get(layer) ?? 0) + 1);
                for (const [key, value] of Object.entries(record)) {
                    touch(layer, key);
                    if (opts.nested && isPlainObject(value)) {
                        for (const childKey of Object.keys(value)) touch(layer, `${key}.${childKey}`);
                    }
                }
            } catch {
                // Observability must never affect the run.
            }
        },
        hasDrift(): boolean {
            for (const [layer, fields] of layers) {
                for (const key of fields.keys()) if (statusOf(layer, key) === 'pending' && seenThisRun.get(layer)?.has(key)) return true;
            }
            return false;
        },
        report(): SchemaDriftReport {
            const pendingDrift: Record<string, PendingField[]> = {};
            const disappearedFields: Record<string, string[]> = {};
            const baselineLayers: ObservedBaseline['layers'] = {};

            for (const [layer, fields] of layers) {
                const outFields: Record<string, BaselineField> = {};
                const pend: PendingField[] = [];
                const gone: string[] = [];
                const seen = seenThisRun.get(layer) ?? new Set<string>();
                for (const [key, f] of fields) {
                    const status = statusOf(layer, key);
                    f.status = status;
                    outFields[key] = f;
                    if (!seen.has(key)) gone.push(key);
                    if (status === 'pending' && seen.has(key)) {
                        pend.push({ field: key, firstSeenAt: f.firstSeenAt, lastSeenAt: f.lastSeenAt, sampleCount: f.sampleCount });
                    }
                }
                baselineLayers[layer] = { fields: outFields };
                if (pend.length) pendingDrift[layer] = pend.sort((a, b) => a.field.localeCompare(b.field));
                if (gone.length) disappearedFields[layer] = gone.sort();
            }

            const acknowledgedIgnored: Record<string, string[]> = {};
            for (const [layer, set] of acked) if (set.size) acknowledgedIgnored[layer] = [...set].sort();

            const sampledOut: Record<string, number> = {};
            for (const [layer, n] of sampled) sampledOut[layer] = n;

            return {
                pendingDrift,
                observedBaseline: {
                    baselineVersion: SCHEMA_BASELINE_VERSION,
                    moduleVersion: SCHEMA_DRIFT_MODULE_VERSION,
                    actor: opts.actor,
                    scope,
                    layers: baselineLayers,
                },
                acknowledgedIgnored,
                disappearedFields,
                sampled: sampledOut,
            };
        },
    };
}
