'use client';
import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

type Report = {
  id: string;
  longitude: number;
  latitude: number;
  privacy: string;
  placeLabel: string | null;
  radius: number | null;
  answers: Record<string, unknown>;
};
export function IncidentMap({
  reference,
  center,
  zoom,
  reportingArea,
}: {
  reference: string;
  center: [number, number];
  zoom: number;
  reportingArea: unknown;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map>();
  const [reports, setReports] = useState<Report[]>([]);
  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style:
        process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/liberty',
      center,
      zoom,
    });
    map.addControl(new maplibregl.NavigationControl());
    const markers: maplibregl.Marker[] = [];
    const circles = new Map<string, string>();
    const load = async () => {
      const b = map.getBounds();
      const r = await fetch(
        `/api/incidents/${reference}/reports?west=${b.getWest()}&south=${b.getSouth()}&east=${b.getEast()}&north=${b.getNorth()}`,
      );
      if (!r.ok) return;
      const data = (await r.json()) as { reports: Report[] };
      setReports(data.reports);
      markers.splice(0).forEach((marker) => marker.remove());
      circles.forEach((sourceId) => {
        if (map.getLayer(`${sourceId}-fill`)) map.removeLayer(`${sourceId}-fill`);
        if (map.getLayer(`${sourceId}-line`)) map.removeLayer(`${sourceId}-line`);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      });
      circles.clear();
      data.reports.forEach((report) => {
        const el = document.createElement('button');
        el.className = 'impact-marker';
        el.title = 'Crowdsourced report';
        el.onclick = () => {
          const details = document.createElement('div');
          const title = document.createElement('strong');
          title.textContent = report.placeLabel ?? 'Crowdsourced report';
          details.append(title, document.createElement('br'));
          const privacy = document.createElement('span');
          privacy.textContent =
            report.privacy === 'approximate' ? 'Approximate location' : 'Exact location';
          details.append(privacy);
          Object.entries(report.answers).forEach(([key, value]) => {
            const line = document.createElement('div');
            line.textContent = `${key.replaceAll('_', ' ')}: ${Array.isArray(value) ? value.join(', ') : String(value)}`;
            details.append(line);
          });
          new maplibregl.Popup()
            .setLngLat([report.longitude, report.latitude])
            .setDOMContent(details)
            .addTo(map);
        };
        markers.push(
          new maplibregl.Marker({ element: el })
            .setLngLat([report.longitude, report.latitude])
            .addTo(map),
        );
        if (report.radius) {
          const sourceId = `privacy-${report.id}`;
          const coordinates = Array.from({ length: 49 }, (_, i) => {
            const angle = (i / 48) * Math.PI * 2;
            const lat = report.latitude + (report.radius! / 111_320) * Math.cos(angle);
            const lng =
              report.longitude +
              (report.radius! / (111_320 * Math.cos((report.latitude * Math.PI) / 180))) *
                Math.sin(angle);
            return [lng, lat];
          });
          map.addSource(sourceId, {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: { type: 'Polygon', coordinates: [coordinates] },
            },
          });
          map.addLayer({
            id: `${sourceId}-fill`,
            type: 'fill',
            source: sourceId,
            paint: { 'fill-color': '#176c50', 'fill-opacity': 0.1 },
          });
          map.addLayer({
            id: `${sourceId}-line`,
            type: 'line',
            source: sourceId,
            paint: { 'line-color': '#176c50', 'line-width': 1 },
          });
          circles.set(report.id, sourceId);
        }
      });
    };
    map.on('load', () => {
      if (reportingArea) {
        map.addSource('area', { type: 'geojson', data: reportingArea as never });
        map.addLayer({
          id: 'area-fill',
          type: 'fill',
          source: 'area',
          paint: { 'fill-color': '#176c50', 'fill-opacity': 0.12 },
        });
        map.addLayer({
          id: 'area-line',
          type: 'line',
          source: 'area',
          paint: { 'line-color': '#176c50', 'line-width': 2 },
        });
      }
      void load();
      map.on('moveend', load);
    });
    mapRef.current = map;
    return () => map.remove();
  }, [reference, center, zoom, reportingArea]);
  return (
    <>
      <div ref={container} className="map" aria-label="Interactive incident map" />
      <section>
        <h2>Visible reports ({reports.length})</h2>
        <ul>
          {reports.map((r) => (
            <li key={r.id}>
              {r.placeLabel ?? 'Reported location'} —{' '}
              {r.privacy === 'approximate' ? 'Approximate location' : 'Exact location'}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
