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
}

export interface PublicIncidentView {
  reference: string;
  title: string;
  description: string | null;
  status: 'live' | 'closed';
  longitude: number;
  latitude: number;
  zoom: number;
  reportingArea: unknown | null;
  formSchema: unknown;
  publishedAt: string | null;
}

export interface GeocodeResult {
  label: string;
  latitude: number;
  longitude: number;
  placeLabel?: string;
}

export interface ReportFilters {
  statuses: ReportStatus[];
  fieldFilters: Record<string, string[]>;
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
