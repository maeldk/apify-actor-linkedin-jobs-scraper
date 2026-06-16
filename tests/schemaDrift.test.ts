import { describe, expect, it } from 'vitest';
import {
  createSchemaWatcher,
  SCHEMA_BASELINE_VERSION,
  SCHEMA_DRIFT_MODULE_VERSION,
  type ObservedBaseline,
} from '../src/schemaDrift.js';

describe('schemaDrift v2.0.1', () => {
  it('reports observed fields that are neither mapped nor acknowledged', () => {
    const watcher = createSchemaWatcher({
      actor: 'linkedin-jobs-scraper',
      mappedKnown: { layer: ['mappedField'] },
      acknowledgedIgnored: { layer: ['ignoredField'] },
      now: () => '2026-06-16T00:00:00.000Z',
    });

    watcher.observe('layer', {
      mappedField: 'ok',
      ignoredField: 'ok',
      pendingField: 'new',
    });

    expect(watcher.report().pendingDrift.layer?.map((field) => field.field)).toEqual(['pendingField']);
  });

  it('does not let a prior baseline suppress pending drift', () => {
    const observedBaseline: ObservedBaseline = {
      baselineVersion: SCHEMA_BASELINE_VERSION,
      moduleVersion: SCHEMA_DRIFT_MODULE_VERSION,
      actor: 'linkedin-jobs-scraper',
      scope: 'default',
      layers: {
        layer: {
          fields: {
            pendingField: {
              firstSeenAt: '2026-06-15T00:00:00.000Z',
              lastSeenAt: '2026-06-15T00:00:00.000Z',
              sampleCount: 1,
              status: 'pending',
            },
          },
        },
      },
    };

    const watcher = createSchemaWatcher({
      actor: 'linkedin-jobs-scraper',
      mappedKnown: { layer: [] },
      acknowledgedIgnored: { layer: [] },
      observedBaseline,
      now: () => '2026-06-16T00:00:00.000Z',
    });

    watcher.observe('layer', { pendingField: 'still-new' });

    const report = watcher.report();
    expect(report.pendingDrift.layer?.map((field) => field.field)).toEqual(['pendingField']);
    expect(report.pendingDrift.layer?.[0]?.sampleCount).toBe(2);
  });
});
