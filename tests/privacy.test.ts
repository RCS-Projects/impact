import { describe, expect, it } from 'vitest';
import { approximatePoint, distanceMeters, PRIVACY_RADIUS_METERS } from '@/server/security/privacy';
import { circlePolygon } from '@/lib/geo';

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe('approximatePoint', () => {
  const latitude = 45.4215;
  const longitude = -75.6972;

  it('is deterministic for a seeded generator', () => {
    const a = approximatePoint(latitude, longitude, seededRandom(42));
    const b = approximatePoint(latitude, longitude, seededRandom(42));
    expect(a).toEqual(b);
  });

  it('differs for different seeds', () => {
    const a = approximatePoint(latitude, longitude, seededRandom(1));
    const b = approximatePoint(latitude, longitude, seededRandom(2));
    expect(a).not.toEqual(b);
  });

  it('always stays within the privacy radius', () => {
    for (let seed = 0; seed < 500; seed += 1) {
      const point = approximatePoint(latitude, longitude, seededRandom(seed));
      const distance = distanceMeters(latitude, longitude, point.latitude, point.longitude);
      expect(distance).toBeLessThanOrEqual(PRIVACY_RADIUS_METERS + 0.5);
    }
  });

  it('keeps longitude in range near the antimeridian', () => {
    const point = approximatePoint(45, -179.9999, seededRandom(7));
    expect(point.longitude).toBeGreaterThanOrEqual(-180);
    expect(point.longitude).toBeLessThanOrEqual(180);
  });
});

describe('distanceMeters', () => {
  it('measures one degree of latitude as roughly 111 km', () => {
    const distance = distanceMeters(45, -75, 46, -75);
    expect(distance).toBeGreaterThan(110_000);
    expect(distance).toBeLessThan(112_000);
  });

  it('is zero for identical points', () => {
    expect(distanceMeters(45, -75, 45, -75)).toBe(0);
  });
});

describe('circlePolygon', () => {
  it('produces a closed ring at the expected radius', () => {
    const ring = circlePolygon(45.4215, -75.6972, 152.4, 48);
    expect(ring).toHaveLength(49);
    expect(ring[0]).toEqual(ring[48]);
    for (const [lng, lat] of ring.slice(0, 12)) {
      const distance = distanceMeters(45.4215, -75.6972, lat, lng);
      expect(distance).toBeGreaterThan(145);
      expect(distance).toBeLessThan(160);
    }
  });
});
