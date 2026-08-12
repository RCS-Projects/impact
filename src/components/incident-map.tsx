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
    const load = async () => {
      const b = map.getBounds();
      const r = await fetch(
        `/api/incidents/${reference}/reports?west=${b.getWest()}&south=${b.getSouth()}&east=${b.getEast()}&north=${b.getNorth()}`,
      );
      if (!r.ok) return;
      const data = (await r.json()) as { reports: Report[] };
      setReports(data.reports);
      markers.splice(0).forEach((marker) => marker.remove());
      data.reports.forEach((report) => {
        const el = document.createElement('button');
        el.className = 'impact-marker';
        el.title = 'Crowdsourced report';
        markers.push(
          new maplibregl.Marker({ element: el })
            .setLngLat([report.longitude, report.latitude])
            .addTo(map),
        );
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
