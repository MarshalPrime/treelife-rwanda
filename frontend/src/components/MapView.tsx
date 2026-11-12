"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CircleMarker, MapContainer, Polygon, Popup, useMap } from "react-leaflet";
import { ImageryLayer, MapLayerToggle } from "@/components/map-imagery";
import type { MapFeature } from "@/lib/types";
import "leaflet/dist/leaflet.css";

const colors: Record<MapFeature["properties"]["kind"], string> = {
  site: "#1c4636",
  tree: "#2d6a4f",
  batch: "#8a5a12",
  forest: "#1f8a4c",
};

export function latLngs(feature: MapFeature): [number, number][] {
  if (feature.geometry.type === "Polygon") {
    return feature.geometry.coordinates[0].map(([longitude, latitude]) => [latitude, longitude]);
  }
  const [longitude, latitude] = feature.geometry.coordinates;
  return [[latitude, longitude]];
}

function Frame({
  features,
  selectedId,
  focusOnSelect,
}: {
  features: MapFeature[];
  selectedId: string | null;
  focusOnSelect: boolean;
}) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    const selected = features.find((feature) => feature.properties.id === selectedId);
    if (focusOnSelect && selected) {
      const spots = latLngs(selected);
      if (spots.length === 1) map.setView(spots[0], 15);
      else map.fitBounds(spots, { padding: [28, 28], maxZoom: 14 });
      return;
    }
    const spots = features.flatMap(latLngs);
    if (spots.length === 0) {
      // Country overview. This is not a recorded tree location.
      map.setView([-1.94, 29.87], 8);
      return;
    }
    if (!focusOnSelect && fitted.current) return;
    fitted.current = true;
    map.fitBounds(spots, { padding: [28, 28], maxZoom: 14 });
  }, [features, focusOnSelect, map, selectedId]);
  return null;
}

export default function MapView({
  features,
  selectedId,
  onSelect,
  colorOf,
  focusOnSelect = true,
  popupFor,
}: {
  features: MapFeature[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  colorOf?: (feature: MapFeature) => string;
  focusOnSelect?: boolean;
  popupFor?: (feature: MapFeature) => ReactNode;
}) {
  const [satellite, setSatellite] = useState(false);
  return (
    <div className="map-stage">
    <MapContainer center={[-1.94, 29.87]} zoom={8} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
      <ImageryLayer satellite={satellite} />
      <Frame features={features} selectedId={selectedId} focusOnSelect={focusOnSelect} />
      {features.filter((feature) => feature.geometry.type === "Polygon").map((feature) => {
        const fill = colorOf ? colorOf(feature) : colors[feature.properties.kind];
        return (
          <Polygon
            key={`${feature.properties.kind}-${feature.properties.id}`}
            positions={latLngs(feature)}
            pathOptions={{
              color: fill,
              weight: feature.properties.id === selectedId ? 4 : 3,
              fillColor: fill,
              fillOpacity: feature.properties.id === selectedId ? 0.55 : 0.42,
            }}
            eventHandlers={{ click: () => onSelect(feature.properties.id) }}
          >
            {popupFor ? (
              <Popup className="record-popup" minWidth={180} maxWidth={240} autoPan>
                {popupFor(feature)}
              </Popup>
            ) : null}
          </Polygon>
        );
      })}
      {features.filter((feature) => feature.geometry.type === "Point").map((feature) => (
        <CircleMarker
          key={`${feature.properties.kind}-${feature.properties.id}`}
          center={latLngs(feature)[0]}
          radius={feature.properties.id === selectedId ? 9 : 6}
          pathOptions={{
            color: "#ffffff",
            weight: 2,
            fillColor: colorOf ? colorOf(feature) : colors[feature.properties.kind],
            fillOpacity: 0.95,
          }}
          eventHandlers={{ click: () => onSelect(feature.properties.id) }}
        >
          {popupFor ? (
            <Popup className="record-popup" minWidth={180} maxWidth={240} autoPan>
              {popupFor(feature)}
            </Popup>
          ) : null}
        </CircleMarker>
      ))}
    </MapContainer>
    <MapLayerToggle satellite={satellite} onToggle={() => setSatellite((current) => !current)} />
    </div>
  );
}
