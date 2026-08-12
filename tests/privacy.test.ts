import { describe, expect, it } from 'vitest';
import { approximatePoint, PRIVACY_RADIUS_METERS } from '../src/lib/security';

function distance(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const r = 6371008.8;
  const radians = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * radians;
  const dLng = (b.longitude - a.longitude) * radians;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(x));
}

describe('approximate public points', () => {
  it('always stays within the privacy radius', () => {
    const actual = { latitude: 45.4215, longitude: -75.6972 };
    for (let index = 0; index < 500; index++)
      expect(
        distance(actual, approximatePoint(actual.latitude, actual.longitude)),
      ).toBeLessThanOrEqual(PRIVACY_RADIUS_METERS + 0.001);
  });
});
