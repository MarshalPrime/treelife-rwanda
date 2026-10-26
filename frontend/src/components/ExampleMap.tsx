"use client";

import { useEffect } from "react";
import { CircleMarker, MapContainer, TileLayer, useMap } from "react-leaflet";
import { dashboardTrees } from "@/lib/example-tree";
import "leaflet/dist/leaflet.css";

function Frame() {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(
      dashboardTrees.map((tree) => [tree.latitude, tree.longitude] as [number, number]),
      { padding: [28, 28], maxZoom: 8 },
    );
  }, [map]);
  return null;
}

export default function ExampleMap() {
  return (
    <MapContainer
      center={[-1.94, 29.87]}
      zoom={7}
      zoomControl={false}
      scrollWheelZoom={false}
      dragging={false}
      doubleClickZoom={false}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Frame />
      {dashboardTrees.map((tree) => (
        <CircleMarker
          key={tree.species}
          center={[tree.latitude, tree.longitude]}
          radius={8}
          pathOptions={{ color: "#ffffff", weight: 2, fillColor: "#1c4636", fillOpacity: 1 }}
        />
      ))}
    </MapContainer>
  );
}
