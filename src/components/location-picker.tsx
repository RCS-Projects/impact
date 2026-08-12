'use client';
import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
type Point = { latitude: number; longitude: number; placeLabel?: string };
export function LocationPicker({
  center,
  onChange,
}: {
  center: [number, number];
  onChange: (point: Point) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map>();
  const marker = useRef<maplibregl.Marker>();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Point[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style:
        process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/liberty',
      center,
      zoom: 12,
    });
    const setPoint = (point: Point) => {
      marker.current?.remove();
      marker.current = new maplibregl.Marker({ draggable: true })
        .setLngLat([point.longitude, point.latitude])
        .addTo(map);
      marker.current.on('dragend', () => {
        const p = marker.current?.getLngLat();
        if (p) onChange({ latitude: p.lat, longitude: p.lng });
      });
      onChange(point);
    };
    map.on('click', (event) =>
      setPoint({ latitude: event.lngLat.lat, longitude: event.lngLat.lng }),
    );
    mapRef.current = map;
    return () => map.remove();
  }, [center, onChange]);
  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const response = await fetch(`/api/geocode/search?q=${encodeURIComponent(query)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? 'Address search unavailable');
        return;
      }
      setError('');
      setResults(data.results ?? []);
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);
  function choose(point: Point) {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center: [point.longitude, point.latitude], zoom: 15 });
    const event = { lngLat: new maplibregl.LngLat(point.longitude, point.latitude) };
    map.fire('click', event as never);
    setResults([]);
    setQuery(point.placeLabel ?? 'Selected location');
  }
  function geolocate() {
    navigator.geolocation?.getCurrentPosition(
      (position) =>
        choose({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          placeLabel: 'Device location',
        }),
      () => setError('Location permission was not granted. Click the map or search an address.'),
    );
  }
  return (
    <section className="location-picker">
      <h2>Choose report location</h2>
      <label>
        Canadian address
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search an address or community"
        />
      </label>
      {results.length > 0 && (
        <ul className="search-results">
          {results.map((point, i) => (
            <li key={i}>
              <button type="button" onClick={() => choose(point)}>
                {point.placeLabel ?? `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="secondary-button" onClick={geolocate}>
        Use my location
      </button>
      <p>{error}</p>
      <div
        ref={container}
        className="picker-map"
        aria-label="Click or drag the marker to choose a report location"
      />
    </section>
  );
}
