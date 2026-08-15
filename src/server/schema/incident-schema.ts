import { z } from 'zod';

export const displaySettingsInputSchema = z
  .object({
    pointRadius: z.number().int().min(4).max(30).optional(),
    clusterRadius: z.number().int().min(20).max(100).optional(),
    clusterMaxZoom: z.number().int().min(8).max(18).optional(),
    showDescription: z.boolean().optional(),
  })
  .strict();

export const DEFAULT_DISPLAY_SETTINGS = {
  pointRadius: 10,
  clusterRadius: 45,
  clusterMaxZoom: 14,
  showDescription: true,
} as const;

export function parseDisplaySettings(value: unknown) {
  return { ...DEFAULT_DISPLAY_SETTINGS, ...displaySettingsInputSchema.parse(value ?? {}) };
}

const CANADA_BOUNDS = { minLongitude: -142, maxLongitude: -52, minLatitude: 41, maxLatitude: 84 };
type Position = [number, number];

function position(value: unknown): value is Position {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    value[0] >= CANADA_BOUNDS.minLongitude &&
    value[0] <= CANADA_BOUNDS.maxLongitude &&
    value[1] >= CANADA_BOUNDS.minLatitude &&
    value[1] <= CANADA_BOUNDS.maxLatitude
  );
}

function validRing(value: unknown): value is Position[] {
  if (!Array.isArray(value) || value.length < 4 || value.length > 5_000) return false;
  if (!value.every(position)) return false;
  const first = value[0]!;
  const last = value[value.length - 1]!;
  return first[0] === last[0] && first[1] === last[1];
}

const positionSchema = z.array(z.number().finite()).min(2).max(3);
const ringSchema = z.array(positionSchema).min(4).max(5_000);
const polygonCoordinatesSchema = z.array(ringSchema).min(1);

const reportingAreaShapeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Polygon'), coordinates: polygonCoordinatesSchema }).strict(),
  z
    .object({ type: z.literal('MultiPolygon'), coordinates: z.array(polygonCoordinatesSchema) })
    .strict(),
]);

export const reportingAreaSchema = reportingAreaShapeSchema.superRefine((area, ctx) => {
  const polygons = area.type === 'Polygon' ? [area.coordinates] : area.coordinates;
  if (polygons.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Reporting area must contain at least one polygon',
    });
    return;
  }
  let vertices = 0;
  for (const polygon of polygons) {
    if (!polygon.every(validRing)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Reporting area rings must be closed and valid',
      });
      return;
    }
    vertices += polygon.reduce((sum, ring) => sum + (ring as Position[]).length, 0);
  }
  if (vertices > 10_000) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Reporting area has too many vertices' });
  }
});

export function parseReportingArea(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return JSON.stringify(reportingAreaSchema.parse(value));
}
