"use client";

import { useEffect, useRef, useState } from "react";
import { CircleMarker, MapContainer, Polygon, Polyline, useMap, useMapEvents } from "react-leaflet";
import { ImageryLayer, MapLayerToggle } from "@/components/map-imagery";
import "leaflet/dist/leaflet.css";

export type Corner = [number, number];

export function outlineHectares(ring: Corner[]) {
  if (ring.length < 3) return null;
  const radius = 6378137;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  let total = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const [lat1, lon1] = ring[index];
    const [lat2, lon2] = ring[(index + 1) % ring.length];
    total += toRadians(lon2 - lon1) * (2 + Math.sin(toRadians(lat1)) + Math.sin(toRadians(lat2)));
  }
  return Math.abs((total * radius * radius) / 2) / 10000;
}

function Clicks({ onAdd }: { onAdd: (corner: Corner) => void }) {
  useMapEvents({
    click(event) {
      onAdd([Number(event.latlng.lat.toFixed(6)), Number(event.latlng.lng.toFixed(6))]);
    },
  });
  return null;
}

function FitSaved({ ring }: { ring: Corner[] }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || ring.length < 2) return;
    fitted.current = true;
    map.fitBounds(ring, { padding: [24, 24], maxZoom: 14 });
  }, [map, ring]);
  return null;
}

export function BoundaryDraw({
  ring,
  onChange,
}: {
  ring: Corner[];
  onChange: (ring: Corner[]) => void;
}) {
  const [satellite, setSatellite] = useState(false);
  const area = outlineHectares(ring);
  return (
    <div className="location-map-wrap">
      <MapContainer center={[-1.94, 29.87]} zoom={8} className="location-map" scrollWheelZoom>
        <ImageryLayer satellite={satellite} />
        <FitSaved ring={ring} />
        <Clicks onAdd={(corner) => onChange([...ring, corner])} />
        {ring.length >= 2 ? <Polyline positions={ring} pathOptions={{ color: "#1c4636", weight: 2 }} /> : null}
        {ring.length >= 3 ? (
          <Polygon positions={ring} pathOptions={{ color: "#1f8a4c", weight: 2, fillColor: "#1f8a4c", fillOpacity: 0.28 }} />
        ) : null}
        {ring.map((corner, index) => (
          <CircleMarker key={`${corner[0]}-${corner[1]}-${index}`} center={corner} radius={5} pathOptions={{ color: "#ffffff", weight: 2, fillColor: "#1c4636", fillOpacity: 1 }} />
        ))}
      </MapContainer>
      <MapLayerToggle satellite={satellite} onToggle={() => setSatellite((current) => !current)} />
      <div className="actions">
        <button className="secondary" type="button" onClick={() => onChange(ring.slice(0, -1))} disabled={ring.length === 0}>Undo corner</button>
        <button className="secondary" type="button" onClick={() => onChange([])} disabled={ring.length === 0}>Clear outline</button>
      </div>
      <p className="help">
        Click the map to place each corner. Three corners close the stand.
        {area != null ? ` This outline is about ${area.toLocaleString("en-GB", { maximumFractionDigits: 1 })} hectares.` : ""}
      </p>
    </div>
  );
}
