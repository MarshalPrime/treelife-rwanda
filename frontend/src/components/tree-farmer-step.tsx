"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Banner, Field } from "@/components/AppShell";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { readDraft, writeDraft, type FarmerChoice } from "@/lib/tree-draft";
import type { Farmer } from "@/lib/types";
import { newRequestId } from "@/lib/validation";

const addressLevels = [
  ["province", "Province (Intara)"],
  ["district", "District (Akarere)"],
  ["sector", "Sector (Umurenge)"],
  ["cell", "Cell (Akagari)"],
  ["village", "Village (Umudugudu)"],
] as const;

type Level = (typeof addressLevels)[number][0];
type Choice = FarmerChoice;

type Profile = {
  display_name: string;
  phone: string;
  province: string;
  district: string;
  sector: string;
  cell: string;
  village: string;
  isibo: string;
  household: string;
};

const emptyProfile: Profile = {
  display_name: "",
  phone: "",
  province: "",
  district: "",
  sector: "",
  cell: "",
  village: "",
  isibo: "",
  household: "",
};

function profileFrom(farmer: Farmer): Profile {
  return {
    display_name: farmer.display_name ?? "",
    phone: farmer.phone ?? "",
    province: farmer.province ?? "",
    district: farmer.district ?? "",
    sector: farmer.sector ?? "",
    cell: farmer.cell ?? "",
    village: farmer.village ?? "",
    isibo: farmer.isibo ?? "",
    household: farmer.household ?? "",
  };
}

export function TreeFarmerStep({ onContinue }: { onContinue: () => void }) {
  const router = useRouter();
  const { user } = useAuth();
  const requestId = useRef(newRequestId());
  const [choice, setChoice] = useState<Choice>("existing");
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [query, setQuery] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [placeLists, setPlaceLists] = useState<Record<string, string[]> | null>(null);
  const [useLists, setUseLists] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const draft = readDraft();
    setChoice(draft.choice);
    if (draft.farmer_id) setSelectedId(draft.farmer_id);
  }, []);

  useEffect(() => {
    api<Farmer[]>("/farmers").then(setFarmers).catch(() => setFarmers([]));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const farmer = farmers.find((item) => item.id === selectedId);
    if (!farmer) return;
    setQuery(farmer.display_name);
    setProfile(profileFrom(farmer));
  }, [farmers, selectedId]);

  useEffect(() => {
    let active = true;
    api<{ places: string[] }>("/locations")
      .then((body) => {
        if (!active) return;
        setPlaceLists({ province: body.places });
        setUseLists(true);
      })
      .catch(() => { if (active) setUseLists(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!useLists) return;
    const params = new URLSearchParams();
    if (profile.province) params.set("province", profile.province);
    if (profile.district) params.set("district", profile.district);
    if (profile.sector) params.set("sector", profile.sector);
    if (profile.cell) params.set("cell", profile.cell);
    if ([...params.keys()].length === 0) return;
    let active = true;
    api<{ level: string; places: string[] }>(`/locations?${params}`)
      .then((body) => {
        if (active) setPlaceLists((current) => ({ ...current, [body.level]: body.places }));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [useLists, profile.province, profile.district, profile.sector, profile.cell]);

  function choose(next: Choice) {
    setChoice(next);
    setError(null);
    if (next !== "existing") {
      setSelectedId("");
      setProfile(emptyProfile);
    }
  }

  function selectFarmer(farmer: Farmer) {
    setSelectedId(farmer.id);
    setQuery(farmer.display_name);
    setProfile(profileFrom(farmer));
    setListOpen(false);
    setError(null);
  }

  function setPlace(level: Level, value: string) {
    const order: Level[] = ["province", "district", "sector", "cell", "village"];
    setProfile((current) => {
      const next = { ...current, [level]: value };
      let clear = false;
      for (const name of order) {
        if (clear) next[name] = "";
        if (name === level) clear = true;
      }
      return next;
    });
  }

  const needle = query.trim().toLowerCase();
  const matches = farmers
    .filter((farmer) => farmer.registered_by === user?.id)
    .filter((farmer) => browsing || !needle || farmer.display_name.toLowerCase().includes(needle))
    .sort((left, right) => left.display_name.localeCompare(right.display_name));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (choice === "none") {
      writeDraft({ choice, farmer_id: null, step: 2 });
      onContinue();
      return;
    }
    if (!profile.display_name.trim()) {
      setError("Full name is required.");
      return;
    }
    if (choice === "new" && !profile.phone.trim()) {
      setError("Phone number is required.");
      return;
    }
    if (choice === "existing" && !selectedId) {
      setError("Choose a farmer from the list.");
      return;
    }
    const body = {
      display_name: profile.display_name.trim(),
      phone: profile.phone.trim() || null,
      province: profile.province.trim() || null,
      district: profile.district.trim() || null,
      sector: profile.sector.trim() || null,
      cell: profile.cell.trim() || null,
      village: profile.village.trim() || null,
      isibo: profile.isibo.trim() || null,
      household: profile.household.trim() || null,
    };
    setSaving(true);
    try {
      const savedFarmer = choice === "new"
        ? await api<Farmer>("/farmers", {
            method: "POST",
            body: JSON.stringify({ ...body, client_request_id: requestId.current }),
          })
        : await api<Farmer>(`/farmers/${selectedId}`, { method: "PATCH", body: JSON.stringify(body) });
      writeDraft({ choice: "existing", farmer_id: savedFarmer.id, step: 2 });
      setFarmers((current) => {
        const rest = current.filter((item) => item.id !== savedFarmer.id);
        return [savedFarmer, ...rest];
      });
      setSelectedId(savedFarmer.id);
      onContinue();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The farmer could not be saved.");
      setSaving(false);
      return;
    }
    setSaving(false);
  }

  return (
    <>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <form className="card form" onSubmit={save}>
        <fieldset className="role-choice">
          <legend>Farmer information</legend>
          <label>
            <span><input type="radio" name="farmer-choice" checked={choice === "existing"} onChange={() => choose("existing")} /> A farmer already on the list</span>
          </label>
          <label>
            <span><input type="radio" name="farmer-choice" checked={choice === "new"} onChange={() => choose("new")} /> Register a new farmer</span>
          </label>
          <label>
            <span><input type="radio" name="farmer-choice" checked={choice === "none"} onChange={() => choose("none")} /> No named farmer</span>
          </label>
        </fieldset>

        {choice === "existing" ? (
          <div className="farmer-picker">
            <Field label="Search farmers" name="farmer_search" help="Farmers you registered. Search by name, or open the list and scroll.">
              <input
                id="farmer_search"
                value={query}
                placeholder="Farmer name"
                autoComplete="off"
                onFocus={() => { setListOpen(true); setBrowsing(true); }}
                onBlur={() => window.setTimeout(() => setListOpen(false), 150)}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setBrowsing(false);
                  setListOpen(true);
                  setSelectedId("");
                }}
              />
            </Field>
            {listOpen ? (
              farmers.every((farmer) => farmer.registered_by !== user?.id) ? <p className="help">You have not registered a farmer yet.</p> : matches.length === 0 ? <p className="help">No farmer matches that name.</p> : (
                <ul className="farmer-menu" role="listbox" aria-label="Your farmers">
                  {matches.map((farmer) => (
                    <li key={farmer.id}>
                      <button type="button" role="option" aria-selected={farmer.id === selectedId} onMouseDown={(event) => event.preventDefault()} onClick={() => selectFarmer(farmer)}>
                        {farmer.display_name}
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </div>
        ) : null}

        {choice === "none" ? (
          <p className="help">This tree will have no farmer. No farmer record is created.</p>
        ) : null}

        {choice !== "none" && (choice === "new" || selectedId) ? (
          <FarmerProfile
            profile={profile}
            phoneRequired={choice === "new"}
            useLists={useLists}
            placeLists={placeLists}
            onProfile={(field, value) => setProfile((current) => ({ ...current, [field]: value }))}
            onPlace={setPlace}
          />
        ) : null}

        <div className="actions">
          <button className="primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save and continue"}</button>
          <button className="secondary" type="button" onClick={() => router.push("/trees")}>Cancel</button>
        </div>
      </form>
    </>
  );
}

function FarmerProfile({
  profile,
  phoneRequired,
  useLists,
  placeLists,
  onProfile,
  onPlace,
}: {
  profile: Profile;
  phoneRequired: boolean;
  useLists: boolean;
  placeLists: Record<string, string[]> | null;
  onProfile: (field: keyof Profile, value: string) => void;
  onPlace: (level: Level, value: string) => void;
}) {
  const listed = useLists && placeLists;
  return (
    <>
      <h2>Personal information</h2>
      <Field label="Full name" name="display_name">
        <input id="display_name" value={profile.display_name} onChange={(event) => onProfile("display_name", event.target.value)} required />
      </Field>
      <Field label="Phone number" name="phone" help="Sensitive contact information. A phone already on the list is not saved again.">
        <input id="phone" value={profile.phone} onChange={(event) => onProfile("phone", event.target.value)} required={phoneRequired} />
      </Field>
      <h2>Address</h2>
      {listed ? (
        <div className="row">
          {addressLevels.map(([level, text], index) => {
            const parent = index === 0 ? "ready" : profile[addressLevels[index - 1][0]];
            const places = placeLists[level] ?? [];
            const value = profile[level];
            return (
              <Field key={level} label={text} name={level}>
                <select id={level} value={value} disabled={!parent} onChange={(event) => onPlace(level, event.target.value)}>
                  <option value="">{parent ? "Choose" : "Choose the level above"}</option>
                  {value && !places.includes(value) ? <option value={value}>{value}</option> : null}
                  {places.map((place) => <option key={place} value={place}>{place}</option>)}
                </select>
              </Field>
            );
          })}
        </div>
      ) : (
        <>
          <div className="row">
            <Field label="Province (Intara)" name="province"><input id="province" value={profile.province} onChange={(event) => onPlace("province", event.target.value)} /></Field>
            <Field label="District (Akarere)" name="district"><input id="district" value={profile.district} onChange={(event) => onPlace("district", event.target.value)} /></Field>
          </div>
          <div className="row">
            <Field label="Sector (Umurenge)" name="sector"><input id="sector" value={profile.sector} onChange={(event) => onPlace("sector", event.target.value)} /></Field>
            <Field label="Cell (Akagari)" name="cell"><input id="cell" value={profile.cell} onChange={(event) => onPlace("cell", event.target.value)} /></Field>
          </div>
          <Field label="Village (Umudugudu)" name="village"><input id="village" value={profile.village} onChange={(event) => onPlace("village", event.target.value)} /></Field>
        </>
      )}
      <p className="help">Province through village follow the 2019 national village list. Isibo and household are optional.</p>
      <div className="row">
        <Field label="Isibo" name="isibo"><input id="isibo" value={profile.isibo} onChange={(event) => onProfile("isibo", event.target.value)} /></Field>
        <Field label="Household (Urugo)" name="household"><input id="household" value={profile.household} onChange={(event) => onProfile("household", event.target.value)} /></Field>
      </div>
    </>
  );
}
