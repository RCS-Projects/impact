'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { ReportGeometry } from '@/server/schema/report-geometry';
import type { GeocodeResult } from '@/shared/types';

export function ReportGeometryPicker({
  center,
  value,
  onChange,
}: {
  center: [number, number];
  value: ReportGeometry | null;
  onChange: (value: ReportGeometry | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map>();
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [points, setPoints] = useState<[number, number][]>(
    value?.type === 'Polygon' ? (value.coordinates[0]!.slice(0, -1) as [number, number][]) : [],
  );
  const savedPointsRef = useRef(points);
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const [drawing, setDrawing] = useState(value?.type !== 'Polygon');
  const [editing, setEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodeResult[]>([]);
  const drawingRef = useRef(drawing);
  const editingRef = useRef(editing);
  drawingRef.current = drawing;
  editingRef.current = editing;
  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style:
        process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/liberty',
      center,
      zoom: 11,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.on('load', () => {
      map.addSource('drawn-area', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[]] }, properties: {} },
      });
      map.addLayer({
        id: 'drawn-area-fill',
        type: 'fill',
        source: 'drawn-area',
        paint: { 'fill-color': '#f5a524', 'fill-opacity': 0.2 },
      });
      map.addLayer({
        id: 'drawn-area-line',
        type: 'line',
        source: 'drawn-area',
        paint: { 'line-color': '#f5a524', 'line-width': 3 },
      });
    });
    map.on('click', (event) => {
      if (!drawingRef.current || editingRef.current) return;
      setPoints((current) => [...current, [event.lngLat.lng, event.lngLat.lat]]);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = undefined;
    };
  }, [center]);
  useEffect(() => {
    const source = mapRef.current?.getSource('drawn-area') as maplibregl.GeoJSONSource | undefined;
    if (source)
      source.setData({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: points.length >= 3 ? [[...points, points[0]!]] : [points],
        },
        properties: {},
      });
  }, [points]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (drawing && !editing) map.dragPan.disable();
    else map.dragPan.enable();
    requestAnimationFrame(() => map.resize());
  }, [drawing, editing]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 3) {
      setSearchResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/geocode/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => ({}))) as { results?: GeocodeResult[] };
        if (!response.ok) throw new Error('Search unavailable');
        setSearchResults(
          (data.results ?? []).filter((result) => result.boundary?.type === 'Polygon'),
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setSearchResults([]);
      }
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    if (!editing) return;
    points.forEach((point, index) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'geometry-vertex-handle';
      element.setAttribute('aria-label', `Move polygon point ${index + 1}`);
      const marker = new maplibregl.Marker({ element, draggable: true })
        .setLngLat(point)
        .addTo(map);
      marker.on('dragend', () => {
        const location = marker.getLngLat();
        setPoints((current) => {
          const next = [...current];
          next[index] = [location.lng, location.lat];
          onChange({ type: 'Polygon', coordinates: [[...next, next[0]!]] });
          return next;
        });
      });
      markersRef.current.push(marker);
    });
    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
    };
  }, [editing, onChange, points]);
  const finish = useCallback(() => {
    if (points.length >= 3) {
      onChange({ type: 'Polygon', coordinates: [[...points, points[0]!]] });
      setDrawing(false);
      setEditing(false);
    }
  }, [onChange, points]);

  function clear() {
    setPoints([]);
    onChange(null);
    setDrawing(true);
    setEditing(false);
  }

  function undo() {
    setPoints((current) => current.slice(0, -1));
    onChange(null);
  }

  function startDrawing() {
    savedPointsRef.current = pointsRef.current;
    setDrawing(true);
    setEditing(false);
  }

  function cancelDrawing() {
    const previous = savedPointsRef.current;
    setPoints(previous);
    if (previous.length >= 3)
      onChange({ type: 'Polygon', coordinates: [[...previous, previous[0]!]] });
    else onChange(null);
    setDrawing(false);
    setEditing(false);
  }

  function applyBoundary(result: GeocodeResult) {
    if (!result.boundary || result.boundary.type !== 'Polygon') return;
    const ring = result.boundary.coordinates as [number, number][][];
    const next = ring[0]?.slice(0, -1) ?? [];
    if (next.length < 3) return;
    setPoints(next);
    onChange({ type: 'Polygon', coordinates: [[...next, next[0]!]] });
    setDrawing(false);
    setEditing(false);
    setSearchResults([]);
    setSearchQuery(result.placeLabel ?? result.label.split(',')[0] ?? '');
    const map = mapRef.current;
    if (map) {
      const bounds = next.reduce(
        (b, point) => b.extend(point),
        new maplibregl.LngLatBounds(next[0], next[0]),
      );
      map.fitBounds(bounds, { padding: 36, maxZoom: 13 });
    }
  }
  return (
    <div className="geometry-picker">
      <p className="hint">
        {drawing
          ? 'Tap the map to add points. Drag the map normally only after you finish drawing.'
          : 'Your submitted search area is public. Edit the boundary or start over if needed.'}
      </p>
      <label className="field" htmlFor="polygon-place-search">
        Outline a place (optional)
        <input
          id="polygon-place-search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="e.g. Ottawa, Ontario"
          autoComplete="off"
        />
      </label>
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
      <div
        ref={container}
        className={`picker-map${drawing ? ' is-drawing' : ''}`}
        aria-label="Draw a public search area on the map"
        role="img"
      />
      <div className="buttons">
        {drawing ? (
          <button
            type="button"
            className="button button-secondary button-sm"
            onClick={cancelDrawing}
          >
            Cancel drawing
          </button>
        ) : (
          <button
            type="button"
            className="button button-secondary button-sm"
            onClick={startDrawing}
          >
            Draw again
          </button>
        )}
        <button
          type="button"
          className="button button-secondary button-sm"
          disabled={!points.length}
          onClick={undo}
        >
          Undo last point
        </button>
        <button
          type="button"
          className="button button-secondary button-sm"
          disabled={!points.length}
          onClick={clear}
        >
          Clear
        </button>
        <button
          type="button"
          className="button button-sm"
          disabled={points.length < 3}
          onClick={finish}
        >
          Finish area ({points.length} points)
        </button>
        {!drawing && points.length >= 3 && (
          <button
            type="button"
            className="button button-secondary button-sm"
            onClick={() => setEditing(!editing)}
          >
            {editing ? 'Done editing' : 'Edit boundary'}
          </button>
        )}
        {!drawing && (
          <button
            type="button"
            className="button button-secondary button-sm"
            onClick={() => {
              clear();
            }}
          >
            Start over
          </button>
        )}
      </div>
      {points.length > 0 && points.length < 3 && (
        <p className="notice notice-warning" role="status">
          Add at least three points before finishing the area.
        </p>
      )}
    </div>
  );
}
