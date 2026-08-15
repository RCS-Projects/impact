ALTER TABLE incidents ADD COLUMN IF NOT EXISTS report_geometry_mode text NOT NULL DEFAULT 'point'
  CHECK (report_geometry_mode IN ('point', 'polygon', 'point_or_polygon'));

ALTER TABLE reports ADD COLUMN IF NOT EXISTS report_geometry geography(Geometry, 4326);
UPDATE reports SET report_geometry = public_coordinate WHERE report_geometry IS NULL;
CREATE INDEX IF NOT EXISTS reports_geometry_gix ON reports USING GIST (report_geometry);
