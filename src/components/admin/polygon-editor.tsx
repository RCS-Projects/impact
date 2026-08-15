'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

type Coords = [number, number];

export function PolygonEditor({
  center,
  value,
  onChange,
}: {
  center: [number, number];
  value: Coords[] | null;
  onChange: (polygon: Coords[] | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map>();
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [coords, setCoords] = useState<Coords[]>(value ?? []);
  const coordsRef = useRef(coords);
  coordsRef.current = coords;

  const syncMarkers = useCallback(
    (map: maplibregl.Map, pts: Coords[]) => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      pts.forEach((c, i) => {
        const el = document.createElement('div');
        el.style.cssText =
          'width:12px;height:12px;border-radius:50%;background:#f5a524;border:2px solid #0d1215;cursor:grab;';
        const marker = new maplibregl.Marker({ element: el, draggable: true })
          .setLngLat(c)
          .addTo(map);
        marker.on('dragend', () => {
          const ll = marker.getLngLat();
          const next = [...coordsRef.current];
          next[i] = [ll.lng, ll.lat];
          setCoords(next);
        });
        markersRef.current.push(marker);
      });
    },
    [],
  );

  const updateSource = useCallback(
    (map: maplibregl.Map, pts: Coords[]) => {
      const src = map.getSource('polygon') as maplibregl.GeoJSONSource | undefined;
      const geojson: GeoJSON.Feature =
        pts.length >= 3
          ? {
              type: 'Feature',
              geometry: { type: 'Polygon', coordinates: [pts] },
              properties: {},
            }
          : {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: pts[0] ?? center },
              properties: {},
            };
      if (src) {
        src.setData(geojson);
      } else {
        map.addSource('polygon', { type: 'geojson', data: geojson });
        map.addLayer({
          id: 'polygon-fill',
          type: 'fill',
          source: 'polygon',
          paint: { 'fill-color': '#f5a524', 'fill-opacity': 0.12 },
        });
        map.addLayer({
          id: 'polygon-line',
          type: 'line',
          source: 'polygon',
          paint: { 'line-color': '#f5a524', 'line-width': 2 },
        });
      }
      syncMarkers(map, pts);
    },
    [center, syncMarkers],
  );

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/liberty',
      center,
      zoom: 11,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-left');

    map.on('load', () => {
      if (coordsRef.current.length > 0) updateSource(map, coordsRef.current);
    });

    map.on('click', (e) => {
      if (!drawing) return;
      const c: Coords = [e.lngLat.lng, e.lngLat.lat];
      const next = [...coordsRef.current, c];
      setCoords(next);
      updateSource(map, next);
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = undefined;
      markersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (map) updateSource(map, coords);
  }, [coords, updateSource]);

  function clear() {
    setCoords([]);
    onChange(null);
    const map = mapRef.current;
    if (map) {
      const src = map.getSource('polygon') as maplibregl.GeoJSONSource | undefined;
      src?.setData({ type: 'Point', coordinates: center });
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    }
  }

  return (
    <div>
      <div className="buttons" style={{ marginTop: 0, marginBottom: '0.4rem' }}>
        <button
          type="button"
          className={`button button-sm ${drawing ? '' : 'button-secondary'}`}
          onClick={() => setDrawing(!drawing)}
        >
          {drawing ? 'Drawing...' : 'Draw on map'}
        </button>
        {coords.length > 0 && (
          <button type="button" className="button button-secondary button-sm" onClick={clear}>
            Clear
          </button>
        )}
      </div>
      {drawing && (
        <p className="hint" style={{ marginBottom: '0.4rem' }}>
          Click to place vertices. The shape auto-closes at 3+ points. Click Done when finished.
        </p>
      )}
      <div
        ref={container}
        className="picker-map"
        role="img"
        aria-label="Draw the reporting area polygon on the map"
        style={{ cursor: drawing ? 'crosshair' : undefined }}
      />
      {coords.length > 0 && (
        <p className="hint">
          {coords.length} vertex{coords.length !== 1 ? 'ices' : ''}
        </p>
      )}
    </div>
  );
}
