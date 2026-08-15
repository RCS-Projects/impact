import { describe, expect, it } from 'vitest';
import { parseDisplaySettings, parseReportingArea } from '@/server/schema/incident-schema';

const valid = {
  type: 'Polygon',
  coordinates: [[[-75.7, 45.4], [-75.6, 45.4], [-75.6, 45.5], [-75.7, 45.4]]],
};

describe('incident schemas', () => {
  it('defaults and strictly validates display settings', () => {
    expect(parseDisplaySettings({ pointRadius: 14 })).toMatchObject({ pointRadius: 14, clusterRadius: 45 });
    expect(() => parseDisplaySettings({ pointRadius: 99 })).toThrow();
    expect(() => parseDisplaySettings({ unknown: true })).toThrow();
  });

  it('accepts closed Canadian polygons and rejects unsafe areas', () => {
    expect(parseReportingArea(valid)).toContain('Polygon');
    expect(() => parseReportingArea({ ...valid, coordinates: [[[-10, 10], [-10, 11], [-9, 11], [-10, 10]]] })).toThrow();
    expect(() => parseReportingArea({ ...valid, coordinates: [[[-75.7, 45.4], [-75.6, 45.4], [-75.6, 45.5]]] })).toThrow();
  });
});
