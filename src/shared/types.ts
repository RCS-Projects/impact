export type ReportStatus =
  | 'unverified'
  | 'verified'
  | 'flagged'
  | 'resolved'
  | 'rejected'
  | 'removed';

export const PUBLIC_VISIBLE_STATUSES: ReportStatus[] = ['unverified', 'verified', 'resolved'];

export const STATUS_LABELS: Record<ReportStatus, string> = {
  unverified: 'Crowdsourced',
  verified: 'Verified',
  flagged: 'Flagged for review',
  resolved: 'Resolved',
  rejected: 'Rejected',
  removed: 'Removed',
};

export type IncidentStatus = 'draft' | 'live' | 'closed' | 'archived';

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  draft: 'Draft',
  live: 'Live',
  closed: 'Closed',
  archived: 'Archived',
};

export interface PublicReport {
  id: string;
  answers: Record<string, unknown>;
  placeLabel: string | null;
  privacy: 'exact' | 'approximate';
  longitude: number;
  latitude: number;
  radius: number | null;
  status: ReportStatus;
  createdAt: string;
  geometryType?: 'ST_Point' | 'ST_Polygon' | 'Point' | 'Polygon';
  geometry?: { type: 'Point' | 'Polygon'; coordinates: unknown };
}

export interface GeocodeResult {
  label: string;
  latitude: number;
  longitude: number;
  placeLabel?: string;
  boundary?: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };
}

export interface FieldView {
  key: string;
  type: string;
  label: string;
  helpText?: string;
  required: boolean;
  choices?: { value: string; label: string }[];
  constraints?: { minLength?: number; maxLength?: number };
}

export interface FilterDefinition {
  key: string;
  label: string;
  type: 'single_select' | 'multi_select' | 'radio';
  choices: { value: string; label: string }[];
}

export interface PickerPoint {
  latitude: number;
  longitude: number;
  placeLabel?: string;
}
