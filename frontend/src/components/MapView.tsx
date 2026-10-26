"use client";

import { useEffect } from "react";
import { CircleMarker, MapContainer, TileLayer, useMap } from "react-leaflet";
import type { MapFeature } from "@/lib/types";
import "leaflet/dist/leaflet.css";

const colors: Record<MapFeature["properties"]["kind"], string> = {
  site: "#1c4636",
  tree: "#2d6a4f",
  batch: "#8a5a12",
};

function Frame({ features, selectedId }: { features: MapFeature[]; selectedId: string | null }) {
  const map = useMap();
  useEffect(() => {
    const selected = features.find((feature) => feature.properties.id === selectedId);
    if (selected) {
      map.setView([selected.geometry.coordinates[1], selected.geometry.coordinates[0]], 15);
      return;
    }
    if (features.length === 0) {
      // Country overview. This is not a recorded tree location.
      map.setView([-1.94, 29.87], 8);
      return;
    }
    map.fitBounds(
      features.map((feature) => [feature.geometry.coordinates[1], feature.geometry.coordinates[0]] as [number, number]),
      { padding: [28, 28], maxZoom: 14 },
    );
  }, [features, map, selectedId]);
  return null;
}

export default function MapView({
  features,
  selectedId,
  onSelect,
}: {
  features: MapFeature[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <MapContainer center={[-1.94, 29.87]} zoom={8} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Frame features={features} selectedId={selectedId} />
      {features.map((feature) => (
        <CircleMarker
          key={`${feature.properties.kind}-${feature.properties.id}`}
          center={[feature.geometry.coordinates[1], feature.geometry.coordinates[0]]}
          radius={feature.properties.id === selectedId ? 12 : 8}
          pathOptions={{
            color: "#ffffff",
            weight: 2,
            fillColor: colors[feature.properties.kind],
            fillOpacity: 0.95,
          }}
          eventHandlers={{ click: () => onSelect(feature.properties.id) }}
        />
      ))}
    </MapContainer>
  );
}
