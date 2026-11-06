"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Banner, Field } from "@/components/AppShell";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { readDraft, writeDraft } from "@/lib/tree-draft";
import type { Farmer } from "@/lib/types";
import { validateCoordinates } from "@/lib/validation";

const LocationPicker = dynamic(() => import("@/components/LocationPicker"), {
  ssr: false,
  loading: () => <p className="help">Loading the map…</p>,
});

function homeAddress(farmer: Farmer) {
  return [farmer.province, farmer.district, farmer.sector, farmer.cell, farmer.village, farmer.isibo, farmer.household]
    .filter((part) => part && part.length > 0)
    .join(", ");
}

export function TreeLocationStep({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }) {
  const { user } = useAuth();
  const [home, setHome] = useState<string | null>(null);
  const draft = readDraft();
  const [latitude, setLatitude] = useState(draft.latitude);
  const [longitude, setLongitude] = useState(draft.longitude);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role !== "farmer") return;
    api<Farmer>("/farmers/me")
      .then((farmer) => setHome(homeAddress(farmer)))
      .catch(() => setHome(""));
  }, [user]);

  function payload() {
    return { latitude, longitude };
  }

  function back() {
    writeDraft(payload());
    onBack();
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    const coordinates = validateCoordinates(latitude, longitude);
    if (coordinates) {
      setError(coordinates);
      return;
    }
    writeDraft({ ...payload(), step: 4 });
    onContinue();
  }

  return (
    <>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <form className="card form" onSubmit={save}>
        {user?.role === "farmer" && home !== null ? (
          <p className="help">
            {home
              ? `This tree uses where you live: ${home}.`
              : "Add where you live on your account so this tree has an address."}{" "}
            <Link href="/profile">Edit where you live</Link>
          </p>
        ) : null}
        <LocationPicker
          latitude={latitude}
          longitude={longitude}
          onPick={(nextLatitude, nextLongitude) => {
            setLatitude(nextLatitude);
            setLongitude(nextLongitude);
          }}
        />
        <div className="coordinate-pair">
          <div className="row">
            <Field label="Latitude" name="latitude">
              <input id="latitude" inputMode="decimal" value={latitude} onChange={(event) => setLatitude(event.target.value)} />
            </Field>
            <Field label="Longitude" name="longitude">
              <input id="longitude" inputMode="decimal" value={longitude} onChange={(event) => setLongitude(event.target.value)} />
            </Field>
          </div>
          <p className="help">Filled from the map, or typed here. Leave both empty if this record should not appear on the map.</p>
        </div>
        <div className="actions">
          <button className="secondary" type="button" onClick={back}>Back</button>
          <button className="primary" type="submit">Save and continue</button>
        </div>
      </form>
    </>
  );
}
