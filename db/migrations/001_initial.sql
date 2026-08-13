CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE incident_status AS ENUM ('draft', 'live', 'closed', 'archived');
CREATE TYPE report_status AS ENUM (
  'unverified', 'verified', 'flagged', 'resolved', 'rejected', 'removed'
);
CREATE TYPE location_privacy AS ENUM ('exact', 'approximate');
CREATE TYPE actor_type AS ENUM ('public', 'admin', 'system');

CREATE TABLE schema_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  title text NOT NULL,
  description text,
  schema jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE administrators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'moderator')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id char(8) UNIQUE NOT NULL,
  canonical_slug text NOT NULL,
  title text NOT NULL,
  description text,
  status incident_status NOT NULL DEFAULT 'draft',
  form_schema jsonb NOT NULL,
  display_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  initial_center geography(Point, 4326) NOT NULL,
  initial_zoom numeric(4,2) NOT NULL DEFAULT 10,
  reporting_area geography(MultiPolygon, 4326),
  report_expiry_days integer CHECK (report_expiry_days IS NULL OR report_expiry_days > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  closed_at timestamptz,
  archived_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (canonical_slug, public_id)
);

CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  schema_snapshot jsonb NOT NULL,
  answers jsonb NOT NULL,
  public_place_label text,
  location_privacy location_privacy NOT NULL,
  public_coordinate geography(Point, 4326) NOT NULL,
  privacy_radius_meters numeric(8,2),
  browser_token_hash text NOT NULL,
  ip_hash text NOT NULL,
  edit_token_hash text NOT NULL UNIQUE,
  content_hash text NOT NULL,
  status report_status NOT NULL DEFAULT 'unverified',
  suspicious_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (incident_id, browser_token_hash)
);

-- Private coordinates are physically isolated from public report rows.
-- Public queries must never join this table.
CREATE TABLE report_private_locations (
  report_id uuid PRIMARY KEY REFERENCES reports(id) ON DELETE CASCADE,
  submitted_coordinate geography(Point, 4326) NOT NULL,
  submitted_place_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid REFERENCES incidents(id) ON DELETE SET NULL,
  report_id uuid REFERENCES reports(id) ON DELETE SET NULL,
  actor_type actor_type NOT NULL,
  actor_id uuid,
  event_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rate_limit_events (
  id bigserial PRIMARY KEY,
  route text NOT NULL,
  subject_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE geocode_cache (
  key text PRIMARY KEY,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX incidents_public_url_idx ON incidents (canonical_slug, public_id);
CREATE INDEX incidents_status_idx ON incidents (status, updated_at DESC);
CREATE INDEX incidents_reporting_area_gix ON incidents USING GIST (reporting_area);
CREATE INDEX reports_incident_status_idx ON reports (incident_id, status, created_at DESC);
CREATE INDEX reports_browser_hash_idx ON reports (incident_id, browser_token_hash);
CREATE INDEX reports_ip_hash_idx ON reports (incident_id, ip_hash, created_at DESC);
CREATE INDEX reports_content_hash_idx ON reports (incident_id, content_hash);
CREATE INDEX reports_public_coordinate_gix ON reports USING GIST (public_coordinate);
CREATE INDEX private_locations_coordinate_gix ON report_private_locations USING GIST (submitted_coordinate);
CREATE INDEX audit_events_incident_idx ON audit_events (incident_id, created_at DESC);
CREATE INDEX audit_events_report_idx ON audit_events (report_id, created_at DESC);
CREATE INDEX rate_limit_events_lookup_idx ON rate_limit_events (route, subject_hash, created_at DESC);
CREATE INDEX rate_limit_events_created_idx ON rate_limit_events (created_at);
CREATE INDEX geocode_cache_expires_idx ON geocode_cache (expires_at);
