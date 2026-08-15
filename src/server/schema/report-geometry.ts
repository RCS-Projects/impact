import { z } from 'zod';

export const reportGeometryModeSchema = z.enum(['point', 'polygon', 'point_or_polygon']);
export type ReportGeometryMode = z.infer<typeof reportGeometryModeSchema>;

const position = z.tuple([z.number().finite().min(-142).max(-52), z.number().finite().min(41).max(84)]);
const ring = z.array(position).min(4).max(101).superRefine((value, ctx) => {
  const first = value[0];
  const last = value[value.length - 1];
  if (!first || !last || first[0] !== last[0] || first[1] !== last[1])
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Polygon rings must be closed' });
});
const reportPolygonBaseSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(ring).min(1).max(5),
});
export const reportPolygonSchema = reportPolygonBaseSchema.superRefine((value, ctx) => {
  const vertices = value.coordinates.reduce((sum, current) => sum + current.length, 0);
  if (vertices > 100) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Area has too many vertices (maximum 100)' });
});
export const reportPointSchema = z.object({
  type: z.literal('Point'),
  coordinates: position,
});
export const reportGeometrySchema = z.union([reportPointSchema, reportPolygonSchema]);
export type ReportGeometry = z.infer<typeof reportGeometrySchema>;
