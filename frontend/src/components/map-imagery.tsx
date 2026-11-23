"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

export function ImageryLayer({ satellite }: { satellite: boolean }) {
  const map = useMap();

  useEffect(() => {
    const center = map.getCenter();
    const zoom = map.getZoom();
    const layer = L.tileLayer(
      satellite
        ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution: satellite
          ? 'Imagery &copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics, and the GIS User Community'
          : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      },
    );
    layer.addTo(map);
    map.setView(center, zoom, { animate: false });
    return () => {
      map.removeLayer(layer);
    };
  }, [satellite, map]);

  return null;
}

export function MapLayerToggle({
  satellite,
  onToggle,
  satelliteLabel = "Reference imagery",
  streetLabel = "Street map",
}: {
  satellite: boolean;
  onToggle: () => void;
  satelliteLabel?: string;
  streetLabel?: string;
}) {
  return (
    <button
      className="map-layers"
      type="button"
      aria-pressed={satellite}
      aria-label={satellite ? `Show ${streetLabel.toLowerCase()}` : `Show ${satelliteLabel.toLowerCase()}`}
      onClick={onToggle}
    >
      <span className={satellite ? "map-layers-preview streets" : "map-layers-preview satellite"} />
      {satellite ? streetLabel : satelliteLabel}
    </button>
  );
}
