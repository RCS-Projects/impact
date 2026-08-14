'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  PUBLIC_VISIBLE_STATUSES,
  STATUS_LABELS,
  type FilterDefinition,
  type FieldView,
  type PublicReport,
  type ReportStatus,
} from '@/shared/types';
import { circlePolygon } from '@/lib/geo';
import { formatRelativeTime } from '@/lib/format';
import { choiceLabel } from '@/components/report/field-input';

const PALETTE = [
  '#f5a524',
  '#4da3ff',
  '#3fb96f',
  '#e5534b',
  '#c678dd',
  '#56b6c2',
  '#d19a66',
  '#e06c9f',
];

const STATUS_COLORS: Record<string, string> = {
  unverified: '#f5a524',
  verified: '#3fb96f',
  resolved: '#4da3ff',
};

export interface IncidentMapViewProps {
  reference: string;
  title: string;
  description: string | null;
  incidentStatus: 'live' | 'closed';
  center: [number, number];
  zoom: number;
  reportingArea: unknown | null;
  fields: FieldView[];
  filters: FilterDefinition[];
  colorFieldKey: string | null;
  displaySettings?: Record<string, unknown>;
}

export function IncidentMapView(props: IncidentMapViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map>();
  const [mapReady, setMapReady] = useState(false);
  const [reports, setReports] = useState<PublicReport[]>([]);
  const [total, setTotal] = useState(0);
  const [lastReportAt, setLastReportAt] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeStatuses, setActiveStatuses] = useState<Set<ReportStatus>>(
    () => new Set(PUBLIC_VISIBLE_STATUSES),
  );
  const [fieldFilters, setFieldFilters] = useState<Record<string, Set<string>>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loadError, setLoadError] = useState('');

  const colorField = useMemo(
    () => props.filters.find((filter) => filter.key === props.colorFieldKey) ?? null,
    [props.filters, props.colorFieldKey],
  );

  const colorFor = useCallback(
    (report: PublicReport): string => {
      if (colorField) {
        const answer = report.answers[colorField.key];
        const value = Array.isArray(answer) ? answer[0] : answer;
        const index = colorField.choices.findIndex((choice) => choice.value === value);
        if (index >= 0) return PALETTE[index % PALETTE.length] ?? PALETTE[0]!;
      }
      return STATUS_COLORS[report.status] ?? '#f5a524';
    },
    [colorField],
  );

  const stateRef = useRef({ activeStatuses, fieldFilters });
  stateRef.current = { activeStatuses, fieldFilters };

  const loadReports = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = map.getBounds();
    const params = new URLSearchParams({
      west: bounds.getWest().toFixed(5),
      south: bounds.getSouth().toFixed(5),
      east: bounds.getEast().toFixed(5),
      north: bounds.getNorth().toFixed(5),
    });
    const { activeStatuses: statuses, fieldFilters: filters } = stateRef.current;
    if (statuses.size > 0) params.set('status', [...statuses].join(','));
    for (const [key, values] of Object.entries(filters))
      if (values.size > 0) params.set(`filter[${key}]`, [...values].join(','));
    try {
      const response = await fetch(`/api/incidents/${props.reference}/reports?${params}`);
      if (!response.ok) return;
      const data = (await response.json()) as {
        reports: PublicReport[];
        total: number;
        lastReportAt: string | null;
      };
      setReports(data.reports);
      setTotal(data.total);
      setLastReportAt(data.lastReportAt);
      setLoadError('');
    } catch {
      setLoadError('Could not refresh reports.');
    }
  }, [props.reference]);

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style:
        process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/liberty',
      center: props.center,
      zoom: props.zoom,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', () => {
      map.addSource('reports', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 45,
      });
      map.addSource('privacy-circles', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'privacy-fill',
        type: 'fill',
        source: 'privacy-circles',
        paint: { 'fill-color': '#4da3ff', 'fill-opacity': 0.08 },
      });
      map.addLayer({
        id: 'privacy-line',
        type: 'line',
        source: 'privacy-circles',
        paint: { 'line-color': '#4da3ff', 'line-width': 1, 'line-opacity': 0.5 },
      });
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'reports',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step',
            ['get', 'point_count'],
            '#f5a524',
            25,
            '#ff8c42',
            100,
            '#e5534b',
          ],
          'circle-radius': ['step', ['get', 'point_count'], 16, 25, 20, 100, 25],
          'circle-opacity': 0.9,
          'circle-stroke-color': '#0d1215',
          'circle-stroke-width': 2,
        },
      });
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'reports',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-size': 13,
          'text-font': ['Open Sans Semibold'],
        },
        paint: { 'text-color': '#1a1204' },
      });
      map.addLayer({
        id: 'report-points',
        type: 'circle',
        source: 'reports',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': 10,
          'circle-stroke-color': '#0d1215',
          'circle-stroke-width': 2,
        },
      });

      if (props.reportingArea) {
        map.addSource('reporting-area', {
          type: 'geojson',
          data: props.reportingArea as GeoJSON.GeoJSON,
        });
        map.addLayer({
          id: 'reporting-area-line',
          type: 'line',
          source: 'reporting-area',
          paint: { 'line-color': '#f5a524', 'line-width': 2, 'line-dasharray': [2, 2] },
        });
      }

      map.on('click', 'clusters', (event) => {
        const feature = map.queryRenderedFeatures(event.point, { layers: ['clusters'] })[0];
        if (!feature) return;
        const source = map.getSource('reports') as maplibregl.GeoJSONSource;
        const geometry = feature.geometry as GeoJSON.Point;
        void source
          .getClusterExpansionZoom(feature.properties?.cluster_id)
          .then((zoom) => map.easeTo({ center: geometry.coordinates as [number, number], zoom }));
      });
      map.on('click', 'report-points', (event) => {
        const feature = map.queryRenderedFeatures(event.point, { layers: ['report-points'] })[0];
        const id = feature?.properties?.id as string | undefined;
        if (id) setSelectedId(id);
      });
      map.on('mouseenter', 'report-points', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'report-points', () => {
        map.getCanvas().style.cursor = '';
      });

      let debounce: ReturnType<typeof setTimeout>;
      map.on('moveend', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => void loadReports(), 500);
      });

      setMapReady(true);
      void loadReports();
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = undefined;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapReady) void loadReports();
  }, [mapReady, activeStatuses, fieldFilters, loadReports]);

  useEffect(() => {
    const interval = setInterval(() => void loadReports(), 30_000);
    return () => clearInterval(interval);
  }, [loadReports]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const pointSource = map.getSource('reports') as maplibregl.GeoJSONSource | undefined;
    const circleSource = map.getSource('privacy-circles') as maplibregl.GeoJSONSource | undefined;
    if (!pointSource || !circleSource) return;
    pointSource.setData({
      type: 'FeatureCollection',
      features: reports.map((report) => ({
        type: 'Feature',
        properties: { id: report.id, color: colorFor(report) },
        geometry: { type: 'Point', coordinates: [report.longitude, report.latitude] },
      })),
    });
    circleSource.setData({
      type: 'FeatureCollection',
      features: reports
        .filter((report) => report.privacy === 'approximate' && report.radius)
        .map((report) => ({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [circlePolygon(report.latitude, report.longitude, report.radius ?? 152.4)],
          },
        })),
    });
  }, [reports, mapReady, colorFor]);

  function toggleStatus(status: ReportStatus) {
    setActiveStatuses((previous) => {
      const next = new Set(previous);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  function toggleFieldFilter(key: string, value: string) {
    setFieldFilters((previous) => {
      const next = { ...previous };
      const values = new Set(next[key] ?? []);
      if (values.has(value)) values.delete(value);
      else values.add(value);
      next[key] = values;
      return next;
    });
  }

  const selected = selectedId ? (reports.find((report) => report.id === selectedId) ?? null) : null;

  return (
    <div className="stage">
      <header className="topbar">
        <div>
          <div className="topbar-title">{props.title}</div>
          {props.description && <div className="hint topbar-desc">{props.description}</div>}
        </div>
        <span className={`chip ${props.incidentStatus === 'live' ? 'chip-live' : 'chip-closed'}`}>
          {props.incidentStatus === 'live' ? 'Receiving reports' : 'Closed to new reports'}
        </span>
        <div className="topbar-spacer" />
        <div className="topbar-stats" aria-live="polite">
          <span>
            <strong>{total}</strong> reports
          </span>
          <span>Last: {formatRelativeTime(lastReportAt)}</span>
        </div>
        <button
          type="button"
          className="button button-secondary button-sm"
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
        >
          Filters
        </button>
        {props.incidentStatus === 'live' && (
          <a className="button button-sm topbar-cta" href={`/map/${props.reference}/report`}>
            Submit a Report
          </a>
        )}
      </header>

      <div className="map-wrap">
        <div ref={container} className="map" aria-label="Interactive incident map" />

        {filtersOpen && (
          <aside className="panel filter-panel" aria-label="Map filters">
            <h2>Filters</h2>
            <div className="filter-group">
              <div className="filter-group-label">Report status</div>
              <div className="chip-row">
                {PUBLIC_VISIBLE_STATUSES.map((status) => (
                  <button
                    key={status}
                    type="button"
                    className="chip chip-toggle"
                    aria-pressed={activeStatuses.has(status)}
                    onClick={() => toggleStatus(status)}
                  >
                    {STATUS_LABELS[status]}
                  </button>
                ))}
              </div>
            </div>
            {props.filters.map((filter) => (
              <div className="filter-group" key={filter.key}>
                <div className="filter-group-label">{filter.label}</div>
                <div className="chip-row">
                  {filter.choices.map((choice) => (
                    <button
                      key={choice.value}
                      type="button"
                      className="chip chip-toggle"
                      aria-pressed={fieldFilters[filter.key]?.has(choice.value) ?? false}
                      onClick={() => toggleFieldFilter(filter.key, choice.value)}
                    >
                      {choice.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="legend" aria-label="Legend">
              {colorField
                ? colorField.choices.map((choice, index) => (
                    <span className="legend-item" key={choice.value}>
                      <span
                        className="legend-dot"
                        style={{ background: PALETTE[index % PALETTE.length] }}
                      />
                      {choice.label}
                    </span>
                  ))
                : Object.entries(STATUS_COLORS).map(([status, color]) => (
                    <span className="legend-item" key={status}>
                      <span className="legend-dot" style={{ background: color }} />
                      {STATUS_LABELS[status as ReportStatus]}
                    </span>
                  ))}
              <span className="legend-item">
                <span
                  className="legend-dot"
                  style={{ background: 'transparent', border: '1px solid #4da3ff' }}
                />
                500-foot privacy circle (approximate reports)
              </span>
            </div>
            <details>
              <summary>Report list ({reports.length} in view)</summary>
              <ul>
                {reports.map((report) => (
                  <li key={report.id}>
                    <button
                      type="button"
                      className="button button-secondary button-sm"
                      style={{ margin: '0.2rem 0' }}
                      onClick={() => {
                        setSelectedId(report.id);
                        mapRef.current?.easeTo({
                          center: [report.longitude, report.latitude],
                          zoom: Math.max(mapRef.current.getZoom(), 13),
                        });
                      }}
                    >
                      {report.placeLabel ?? 'Reported location'} — {STATUS_LABELS[report.status]}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          </aside>
        )}

        {selected && (
          <aside className="panel detail-panel" aria-label="Report details">
            <button
              type="button"
              className="detail-close"
              aria-label="Close report details"
              onClick={() => setSelectedId(null)}
            >
              ×
            </button>
            <h3>{selected.placeLabel ?? 'Crowdsourced report'}</h3>
            <span className={`chip chip-${selected.status}`}>{STATUS_LABELS[selected.status]}</span>
            <p className="hint">
              {selected.privacy === 'approximate'
                ? 'Approximate location — the true position is hidden somewhere inside the circle.'
                : 'Exact location.'}{' '}
              Reported {formatRelativeTime(selected.createdAt)}.
            </p>
            <dl>
              {props.fields
                .filter((field) => field.type !== 'info')
                .map((field) => {
                  const value = selected.answers[field.key];
                  if (value === undefined || value === null || value === '') return null;
                  return (
                    <div className="detail-row" key={field.key}>
                      <dt>{field.label}</dt>
                      <dd>{choiceLabel(props.fields, field.key, value)}</dd>
                    </div>
                  );
                })}
            </dl>
            <p className="hint">Crowdsourced — may not be independently verified.</p>
          </aside>
        )}

        {loadError && <div className="map-note notice-error">{loadError}</div>}
        {!selected && (
          <div className="map-note">
            Reports are crowdsourced and may not be independently verified.
          </div>
        )}
        {props.incidentStatus === 'live' && (
          <a className="button fab" href={`/map/${props.reference}/report`} aria-label="Submit a report">
            + Report
          </a>
        )}
      </div>
    </div>
  );
}
