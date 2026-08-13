'use client';
import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { GeocodeResult, PickerPoint } from '@/shared/types';
import { formatCoordinates, pointInGeoJsonArea } from '@/lib/geo';

export function LocationPicker({
  center,
  reportingArea,
  value,
  onChange,
}: {
  center: [number, number];
  reportingArea: unknown | null;
  value: PickerPoint | null;
  onChange: (point: PickerPoint) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map>();
  const markerRef = useRef<maplibregl.Marker>();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searchState, setSearchState] = useState<'idle' | 'searching' | 'error'>('idle');
  const [searchError, setSearchError] = useState('');

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
      if (reportingArea) {
        map.addSource('reporting-area', {
          type: 'geojson',
          data: reportingArea as GeoJSON.GeoJSON,
        });
        map.addLayer({
          id: 'reporting-area-fill',
          type: 'fill',
          source: 'reporting-area',
          paint: { 'fill-color': '#f5a524', 'fill-opacity': 0.06 },
        });
        map.addLayer({
          id: 'reporting-area-line',
          type: 'line',
          source: 'reporting-area',
          paint: { 'line-color': '#f5a524', 'line-width': 2, 'line-dasharray': [2, 2] },
        });
      }
    });

    map.on('click', (event) => {
      setMarker(map, { latitude: event.lngLat.lat, longitude: event.lngLat.lng });
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = undefined;
      markerRef.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setMarker(map: maplibregl.Map, point: PickerPoint) {
    markerRef.current?.remove();
    const marker = new maplibregl.Marker({ draggable: true, color: '#f5a524' })
      .setLngLat([point.longitude, point.latitude])
      .addTo(map);
    marker.on('dragend', () => {
      const lngLat = marker.getLngLat();
      onChange({ latitude: lngLat.lat, longitude: lngLat.lng });
    });
    markerRef.current = marker;
    onChange(point);
  }

  function chooseResult(result: GeocodeResult) {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center: [result.longitude, result.latitude], zoom: 14 });
    setMarker(map, {
      latitude: result.latitude,
      longitude: result.longitude,
      placeLabel: result.placeLabel,
    });
    setResults([]);
    setQuery(result.placeLabel ?? result.label.split(',')[0] ?? '');
  }

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setResults([]);
      setSearchState('idle');
      return;
    }
    const timer = setTimeout(async () => {
      setSearchState('searching');
      try {
        const response = await fetch(`/api/geocode/search?q=${encodeURIComponent(trimmed)}`);
        const data = (await response.json().catch(() => ({}))) as {
          results?: GeocodeResult[];
          error?: string;
        };
        if (!response.ok) {
          setSearchState('error');
          setSearchError(data.error ?? 'Address search unavailable');
          setResults([]);
          return;
        }
        setSearchState('idle');
        setSearchError('');
        setResults(data.results ?? []);
      } catch {
        setSearchState('error');
        setSearchError('Address search unavailable');
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  function geolocate() {
    if (!navigator.geolocation) {
      setSearchError('Device location is not available. Click the map instead.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const map = mapRef.current;
        if (!map) return;
        const point = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          placeLabel: 'Device location',
        };
        map.flyTo({ center: [point.longitude, point.latitude], zoom: 15 });
        setMarker(map, point);
      },
      () => setSearchError('Location permission was not granted. Click the map or search instead.'),
    );
  }

  const outsideArea =
    value && reportingArea
      ? !pointInGeoJsonArea(value.longitude, value.latitude, reportingArea)
      : false;

  return (
    <section aria-label="Choose report location">
      <h2>Where is the issue?</h2>
      <p className="hint">
        Search a Canadian address, community, road, intersection, or postal code — or click the map,
        drag the pin, or use your device location.
      </p>
      <label className="field" htmlFor="geocode-query">
        Address or place search
        <input
          id="geocode-query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="e.g. 123 Main St Renfrew, or Arnprior"
          autoComplete="off"
        />
      </label>
      {searchState === 'searching' && <p className="hint">Searching…</p>}
      {searchState === 'error' && <p className="notice notice-warn">{searchError}</p>}
      {results.length > 0 && (
        <ul className="search-results" aria-label="Search results">
          {results.map((result, index) => (
            <li key={`${result.latitude}-${result.longitude}-${index}`}>
              <button type="button" onClick={() => chooseResult(result)}>
                {result.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="buttons">
        <button type="button" className="button button-secondary button-sm" onClick={geolocate}>
          Use my location
        </button>
      </div>
      <div
        ref={container}
        className="picker-map"
        role="application"
        aria-label="Click or drag the marker to choose the report location"
      />
      {value && (
        <p className="hint">
          Selected: {formatCoordinates(value.latitude, value.longitude)}
          {value.placeLabel ? ` (${value.placeLabel})` : ''}
        </p>
      )}
      {outsideArea && (
        <p className="notice notice-warn">
          This point looks outside the incident reporting area. Submissions outside the area will be
          rejected.
        </p>
      )}
      {!value && <p className="hint">Choose a location before submitting.</p>}
    </section>
  );
}
