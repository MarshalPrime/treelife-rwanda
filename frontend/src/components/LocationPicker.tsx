"use client";

import { useEffect, useState } from "react";
import { MapContainer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { ImageryLayer, MapLayerToggle } from "@/components/map-imagery";
import "leaflet/dist/leaflet.css";

type Point = { lat: number; lng: number };
type Place = { label: string; latitude: string; longitude: string };

const pinIcon = L.divIcon({
  className: "location-pin",
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function readPair(latitude: string, longitude: string): Point | null {
  if (!latitude.trim() || !longitude.trim()) return null;
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function formatCoordinate(value: number) {
  return value.toFixed(6);
}

function PinLayer({
  latitude,
  longitude,
  onPick,
}: {
  latitude: string;
  longitude: string;
  onPick: (latitude: string, longitude: string) => void;
}) {
  const map = useMap();

  useEffect(() => {
    const pair = readPair(latitude, longitude);
    if (!pair) return;
    map.setView([pair.lat, pair.lng], Math.max(map.getZoom(), 16));
  }, [latitude, longitude, map]);

  useMapEvents({
    click(event) {
      onPick(formatCoordinate(event.latlng.lat), formatCoordinate(event.latlng.lng));
    },
  });

  const point = readPair(latitude, longitude);
  if (!point) return null;
  return (
    <Marker
      position={[point.lat, point.lng]}
      icon={pinIcon}
      draggable
      eventHandlers={{
        dragend(event) {
          const next = event.target.getLatLng();
          onPick(formatCoordinate(next.lat), formatCoordinate(next.lng));
        },
      }}
    />
  );
}

export default function LocationPicker({
  latitude,
  longitude,
  onPick,
}: {
  latitude: string;
  longitude: string;
  onPick: (latitude: string, longitude: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [view, setView] = useState<"map" | "satellite">("map");

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setNote("This browser cannot read the current location. Click the map instead.");
      return;
    }
    setLocating(true);
    setNote(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onPick(formatCoordinate(position.coords.latitude), formatCoordinate(position.coords.longitude));
        setPlaces([]);
        setLocating(false);
      },
      (error) => {
        setLocating(false);
        setNote(
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied. Allow location for this site, or click the map."
            : "The current location could not be read. Click the map instead.",
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  async function search() {
    const text = query.trim();
    if (text.length < 2) {
      setNote("Type at least two letters, or click the map.");
      setPlaces([]);
      return;
    }
    setSearching(true);
    setNote(null);
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(text)}`);
      const body = await response.json() as { results?: Place[]; error?: string };
      const results = body.results ?? [];
      setPlaces(results);
      if (body.error) setNote(body.error);
      else if (results.length === 0) setNote("No place matched that name. Click the map to set the point.");
      else {
        const first = results[0];
        onPick(formatCoordinate(Number(first.latitude)), formatCoordinate(Number(first.longitude)));
      }
    } catch {
      setPlaces([]);
      setNote("The place search did not answer. Click the map to set the point.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="location-picker">
      <div className="location-search">
        <label htmlFor="place-search">Search for the place
          <input
            id="place-search"
            value={query}
            placeholder="Village, road, or landmark in Rwanda"
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void search();
              }
            }}
          />
        </label>
        <div className="location-actions">
          <button className="secondary" type="button" onClick={() => void search()} disabled={searching || locating}>
            {searching ? "Searching…" : "Search"}
          </button>
          <button className="secondary" type="button" onClick={useCurrentLocation} disabled={searching || locating}>
            {locating ? "Finding location…" : "Current location"}
          </button>
        </div>
      </div>
      {places.length > 1 ? (
        <div className="location-results">
          {places.map((place) => (
            <button
              key={`${place.latitude}-${place.longitude}-${place.label}`}
              className="secondary"
              type="button"
              onClick={() => onPick(formatCoordinate(Number(place.latitude)), formatCoordinate(Number(place.longitude)))}
            >
              {place.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="location-map-wrap">
        <MapContainer
          center={[-1.94, 29.87]}
          zoom={8}
          className="location-map"
          scrollWheelZoom
        >
          <ImageryLayer satellite={view === "satellite"} />
          <PinLayer latitude={latitude} longitude={longitude} onPick={onPick} />
        </MapContainer>
        <MapLayerToggle
          satellite={view === "satellite"}
          onToggle={() => setView((current) => (current === "map" ? "satellite" : "map"))}
        />
      </div>
      <p className="help">
        {note ?? "Use current location, search, or click the map. Latitude and longitude below follow that point. The opening view is Rwanda, not a recorded tree."}
      </p>
    </div>
  );
}
