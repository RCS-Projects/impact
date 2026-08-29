'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { GeocodeResult } from '@/shared/types';

type Coords = [number, number];
export type BoundaryGeometry =
  | { type: 'Polygon'; coordinates: Coords[][] }
  | { type: 'MultiPolygon'; coordinates: Coords[][][] };

function closeRing(points: Coords[]) {
  return points.length >= 3 ? [...points, points[0]!] : points;
}

function editablePoints(value: BoundaryGeometry | null): Coords[] {
  if (!value || value.type !== 'Polygon') return [];
  const ring = value.coordinates[0] ?? [];
  if (ring.length < 2) return [];
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  return first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : [...ring];
}

function isBoundary(value: unknown): value is BoundaryGeometry {
  if (!value || typeof value !== 'object') return false;
  const geometry = value as { type?: unknown; coordinates?: unknown };
  return (
    (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') &&
    Array.isArray(geometry.coordinates)
  );
}

export function PolygonEditor({
  center,
  value,
  onChange,
}: {
  center: [number, number];
  value: BoundaryGeometry | null;
  onChange: (polygon: BoundaryGeometry | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map>();
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const pointsRef = useRef<Coords[]>(editablePoints(value));
  const savedPointsRef = useRef<Coords[]>(pointsRef.current);
  const drawingRef = useRef(false);
  const editingRef = useRef(false);
  const [points, setPoints] = useState<Coords[]>(pointsRef.current);
  const [importedBoundary, setImportedBoundary] = useState<BoundaryGeometry | null>(
    value?.type === 'MultiPolygon' ? value : null,
  );
  const [drawing, setDrawing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodeResult[]>([]);
  const [searchState, setSearchState] = useState<'idle' | 'searching' | 'error'>('idle');

  drawingRef.current = drawing;
  editingRef.current = editing;
  pointsRef.current = points;

  const geometry = useCallback(
    (nextPoints = pointsRef.current): BoundaryGeometry | null =>
      importedBoundary ??
      (nextPoints.length >= 3 ? { type: 'Polygon', coordinates: [closeRing(nextPoints)] } : null),
    [importedBoundary],
  );

  const updateSource = useCallback(
    (map: maplibregl.Map, nextPoints = pointsRef.current) => {
      const source = map.getSource('polygon') as maplibregl.GeoJSONSource | undefined;
      const nextGeometry = geometry(nextPoints);
      const data: GeoJSON.Feature = nextGeometry
        ? { type: 'Feature', geometry: nextGeometry, properties: {} }
        : {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: nextPoints[0] ?? center },
            properties: {},
          };
      if (source) source.setData(data);
      else {
        map.addSource('polygon', { type: 'geojson', data });
        map.addLayer({
          id: 'polygon-fill',
          type: 'fill',
          source: 'polygon',
          paint: { 'fill-color': '#f5a524', 'fill-opacity': 0.16 },
        });
        map.addLayer({
          id: 'polygon-line',
          type: 'line',
          source: 'polygon',
          paint: { 'line-color': '#f5a524', 'line-width': 3 },
        });
      }
    },
    [center, geometry],
  );

  const syncMarkers = useCallback(
    (map: maplibregl.Map, nextPoints = pointsRef.current) => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      if (!editingRef.current || importedBoundary) return;
      nextPoints.forEach((point, index) => {
        const element = document.createElement('button');
        element.type = 'button';
        element.className = 'geometry-vertex-handle';
        element.setAttribute('aria-label', `Move boundary point ${index + 1}`);
        const marker = new maplibregl.Marker({ element, draggable: true })
          .setLngLat(point)
          .addTo(map);
        marker.on('dragend', () => {
          const location = marker.getLngLat();
          setPoints((current) => {
            const next = [...current];
            next[index] = [location.lng, location.lat];
            onChange({ type: 'Polygon', coordinates: [closeRing(next)] });
            return next;
          });
        });
        markersRef.current.push(marker);
      });
    },
    [importedBoundary, onChange],
  );

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style:
        process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/liberty',
      center,
      zoom: 11,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-left');
    map.on('load', () => {
      updateSource(map);
      syncMarkers(map);
    });
    map.on('click', (event) => {
      if (!drawingRef.current || editingRef.current) return;
      setImportedBoundary(null);
      setPoints((current) => {
        const next: Coords[] = [...current, [event.lngLat.lng, event.lngLat.lat]];
        onChange(next.length >= 3 ? { type: 'Polygon', coordinates: [closeRing(next)] } : null);
        return next;
      });
    });
    mapRef.current = map;
    const resize = new ResizeObserver(() => map.resize());
    resize.observe(container.current);
    return () => {
      resize.disconnect();
      markersRef.current.forEach((marker) => marker.remove());
      map.remove();
      mapRef.current = undefined;
    };
  }, [center, onChange, syncMarkers, updateSource]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    updateSource(map, points);
    syncMarkers(map, points);
  }, [importedBoundary, points, syncMarkers, updateSource]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (drawing && !editing) map.dragPan.disable();
    else map.dragPan.enable();
    map.resize();
  }, [drawing, editing]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 3) {
      setSearchResults([]);
      setSearchState('idle');
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchState('searching');
      try {
        const response = await fetch(`/api/geocode/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => ({}))) as { results?: GeocodeResult[] };
        if (!response.ok) throw new Error('Search unavailable');
        setSearchResults((data.results ?? []).filter((result) => isBoundary(result.boundary)));
        setSearchState('idle');
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setSearchResults([]);
        setSearchState('error');
      }
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery]);

  function commit(next: Coords[]) {
    setImportedBoundary(null);
    setPoints(next);
    onChange(next.length >= 3 ? { type: 'Polygon', coordinates: [closeRing(next)] } : null);
  }

  function fitBoundary(boundary: BoundaryGeometry) {
    const flat =
      boundary.type === 'Polygon' ? boundary.coordinates.flat() : boundary.coordinates.flat(2);
    if (flat.length === 0) return;
    const bounds = flat.reduce(
      (current, point) => current.extend(point),
      new maplibregl.LngLatBounds(flat[0], flat[0]),
    );
    mapRef.current?.fitBounds(bounds, { padding: 36, maxZoom: 13 });
  }

  function applyBoundary(result: GeocodeResult) {
    if (!isBoundary(result.boundary)) return;
    const boundary = result.boundary;
    if (boundary.type === 'Polygon') {
      const next = editablePoints(boundary);
      if (next.length < 3) return;
      setImportedBoundary(null);
      setPoints(next);
    } else {
      setPoints([]);
      setImportedBoundary(boundary);
    }
    onChange(boundary);
    setDrawing(false);
    setEditing(false);
    setSearchResults([]);
    setSearchQuery(result.placeLabel ?? result.label.split(',')[0] ?? '');
    fitBoundary(boundary);
  }

  function startDrawing() {
    savedPointsRef.current = pointsRef.current;
    setImportedBoundary(null);
    setDrawing(true);
    setEditing(false);
  }

  function cancelDrawing() {
    commit(savedPointsRef.current);
    setDrawing(false);
    setEditing(false);
  }

  const canEditVertices = !importedBoundary && points.length >= 3;

  return (
    <section className="geometry-editor" aria-label="Reporting boundary editor">
      <label className="field" htmlFor="admin-boundary-place-search">
        Outline a city or place (optional)
        <input
          id="admin-boundary-place-search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="e.g. Ottawa, Ontario"
          autoComplete="off"
        />
      </label>
      {searchState === 'searching' && (
        <p className="hint" role="status">
          Searching for boundaries…
        </p>
      )}
      {searchState === 'error' && (
        <p className="notice notice-warning" role="status">
          Place outline search is unavailable. You can still draw on the map.
        </p>
      )}
      {searchResults.length > 0 && (
        <ul className="search-results" aria-label="Place boundaries">
          {searchResults.map((result, index) => (
            <li key={`${result.latitude}-${result.longitude}-${index}`}>
              <button type="button" onClick={() => applyBoundary(result)}>
                Outline {result.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="buttons u-buttons-polygon">
        <button
          type="button"
          className={`button button-sm ${drawing ? '' : 'button-secondary'}`}
          onClick={drawing ? cancelDrawing : startDrawing}
        >
          {drawing ? 'Cancel drawing' : 'Draw on map'}
        </button>
        {drawing && points.length > 0 && (
          <button
            type="button"
            className="button button-secondary button-sm"
            onClick={() => commit(points.slice(0, -1))}
          >
            Undo last point
          </button>
        )}
        {drawing && (
          <button
            type="button"
            className="button button-sm"
            disabled={points.length < 3}
            onClick={() => setDrawing(false)}
          >
            Finish area
          </button>
        )}
        {(points.length > 0 || importedBoundary) && (
          <button
            type="button"
            className="button button-secondary button-sm"
            onClick={() => {
              setImportedBoundary(null);
              commit([]);
              setEditing(false);
            }}
          >
            Clear
          </button>
        )}
        {canEditVertices && (
          <button
            type="button"
            className="button button-secondary button-sm"
            onClick={() => setEditing((current) => !current)}
          >
            {editing ? 'Done editing' : 'Edit boundary'}
          </button>
        )}
      </div>
      {drawing && (
        <p className="hint u-mb-sm">
          Click or tap to place vertices. Finish after at least three points.
        </p>
      )}
      {importedBoundary?.type === 'MultiPolygon' && (
        <p className="notice notice-warning">
          This place has multiple areas. It will be saved as one MultiPolygon boundary; draw a new
          area to edit individual vertices.
        </p>
      )}
      <div
        ref={container}
        className={`picker-map${drawing ? ' is-drawing' : ''}`}
        role="img"
        aria-label="Draw the reporting area polygon on the map"
      />
      {points.length > 0 && (
        <p className="hint">
          {points.length} vertex{points.length === 1 ? '' : 'ices'}
        </p>
      )}
      {points.length > 0 && points.length < 3 && (
        <p className="notice notice-warning" role="status">
          Add at least 3 points to create a valid boundary.
        </p>
      )}
    </section>
  );
}
