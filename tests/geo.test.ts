import { describe, expect, it } from 'vitest';
import { pointInGeoJsonArea } from '@/lib/geo';

const square = {
  type: 'Polygon',
  coordinates: [
    [
      [-76, 45],
      [-75, 45],
      [-75, 46],
      [-76, 46],
      [-76, 45],
    ],
  ],
};

const squareWithHole = {
  type: 'Polygon',
  coordinates: [
    [
      [-76, 45],
      [-75, 45],
      [-75, 46],
      [-76, 46],
      [-76, 45],
    ],
    [
      [-75.6, 45.4],
      [-75.4, 45.4],
      [-75.4, 45.6],
      [-75.6, 45.6],
      [-75.6, 45.4],
    ],
  ],
};

const multi = {
  type: 'MultiPolygon',
  coordinates: [
    [
      [
        [-80, 44],
        [-79, 44],
        [-79, 45],
        [-80, 45],
        [-80, 44],
      ],
    ],
    [
      [
        [-76, 45],
        [-75, 45],
        [-75, 46],
        [-76, 46],
        [-76, 45],
      ],
    ],
  ],
};

describe('pointInGeoJsonArea', () => {
  it('detects points inside and outside a polygon', () => {
    expect(pointInGeoJsonArea(-75.5, 45.5, square)).toBe(true);
    expect(pointInGeoJsonArea(-74, 45.5, square)).toBe(false);
  });

  it('excludes holes', () => {
    expect(pointInGeoJsonArea(-75.5, 45.5, squareWithHole)).toBe(false);
    expect(pointInGeoJsonArea(-75.9, 45.9, squareWithHole)).toBe(true);
  });

  it('supports multipolygons', () => {
    expect(pointInGeoJsonArea(-79.5, 44.5, multi)).toBe(true);
    expect(pointInGeoJsonArea(-75.5, 45.5, multi)).toBe(true);
    expect(pointInGeoJsonArea(-70, 45, multi)).toBe(false);
  });

  it('treats missing areas as allowing everything', () => {
    expect(pointInGeoJsonArea(-75, 45, null)).toBe(true);
    expect(pointInGeoJsonArea(-75, 45, undefined)).toBe(true);
  });
});
