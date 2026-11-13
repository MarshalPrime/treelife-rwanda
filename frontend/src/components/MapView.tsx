"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { divIcon } from "leaflet";
import { CircleMarker, MapContainer, Marker, Polygon, Popup, useMap } from "react-leaflet";
import { ImageryLayer, MapLayerToggle } from "@/components/map-imagery";
import { featureCenter, formatCoordinates } from "@/lib/coordinates";
import type { MapFeature } from "@/lib/types";
import "leaflet/dist/leaflet.css";

const forestPin = divIcon({
  className: "forest-pin",
  html: `<svg width="28" height="36" viewBox="0 0 28 36" aria-hidden="true"><path d="M14 34.2S4.2 22.6 4.2 15.2a9.8 9.8 0 0 1 19.6 0c0 7.4-9.8 19-9.8 19z" fill="#1f8a4c" stroke="#fff" stroke-width="2"/><circle cx="14" cy="15" r="3.4" fill="#fff"/></svg>`,
  iconSize: [28, 36],
  iconAnchor: [14, 34],
  popupAnchor: [0, -30],
});

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
        const center = featureCenter(feature);
        const coordinates = center ? formatCoordinates(center[0], center[1]) : null;
        return (
          <Fragment key={`${feature.properties.kind}-${feature.properties.id}`}>
          <Polygon
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
          {center && coordinates ? (
            <Marker
              position={center}
              icon={forestPin}
              zIndexOffset={400}
              eventHandlers={{ click: () => onSelect(feature.properties.id) }}
            >
              <Popup className="record-popup" minWidth={180} maxWidth={240} autoPan>
                {popupFor ? popupFor(feature) : <p className="forest-center-popup">{coordinates}</p>}
              </Popup>
            </Marker>
          ) : null}
          </Fragment>
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
