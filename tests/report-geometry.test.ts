import { describe, expect, it } from 'vitest';
import { reportGeometrySchema, reportGeometryModeSchema } from '@/server/schema/report-geometry';

describe('report geometry', () => {
  it('accepts supported modes and a closed polygon', () => {
    expect(reportGeometryModeSchema.parse('point_or_polygon')).toBe('point_or_polygon');
    expect(reportGeometrySchema.parse({ type: 'Polygon', coordinates: [[[-75, 45], [-74.9, 45], [-74.9, 45.1], [-75, 45]]] }).type).toBe('Polygon');
  });
  it('rejects open and oversized polygons', () => {
    expect(() => reportGeometrySchema.parse({ type: 'Polygon', coordinates: [[[-75, 45], [-74.9, 45], [-74.9, 45.1], [-75.1, 45.1]]] })).toThrow();
    const points = Array.from({ length: 101 }, (_, index) => [-75 + index / 10000, 45] as [number, number]);
    points.push(points[0]!);
    expect(() => reportGeometrySchema.parse({ type: 'Polygon', coordinates: [points] })).toThrow();
  });
});
