"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Banner, Field } from "@/components/AppShell";
import { DashboardView } from "@/components/dashboard-view";
import { BuyerRequests } from "@/components/discover";
import { FarmerBoard } from "@/components/farmer-board";
import { HarvestForecast } from "@/components/harvest-forecast";
import { HarvestFeedback, HarvestNotices, HarvestSummary } from "@/components/harvest-insights";
import { TreePlace } from "@/components/forms";
import { RegistrationProgress } from "@/components/registration-progress";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { newRequestId, optionalNumber, todayInput, validateCoordinates } from "@/lib/validation";
import type { Farmer, Page, PlantingRecord, Site, Species } from "@/lib/types";

const LocationPicker = dynamic(() => import("@/components/LocationPicker"), {
  ssr: false,
  loading: () => <p className="help">Loading the map…</p>,
});

type Choice = { id: string; label: string };

function useRequestId() {
  const ref = useRef("");
  if (!ref.current) ref.current = newRequestId();
  return {
    current: () => ref.current,
    rotate: () => {
      ref.current = newRequestId();
    },
  };
}

function message(error: unknown) {
  return error instanceof ApiError ? error.message : "The record could not be saved.";
}

function SavedList({ rows }: { rows: string[] }) {
  if (rows.length === 0) return <p>No records yet.</p>;
  return (
    <ul className="record-list">
      {rows.map((row) => <li key={row}>{row}</li>)}
    </ul>
  );
}

function SelectField({
  label,
  name,
  value,
  options,
  onChange,
  allowEmpty = false,
}: {
  label: string;
  name: string;
  value: string;
  options: Choice[];
  onChange: (value: string) => void;
  allowEmpty?: boolean;
}) {
  return (
    <Field label={label} name={name}>
      <select id={name} value={value} onChange={(event) => onChange(event.target.value)}>
        {allowEmpty ? <option value="">None</option> : null}
        {options.map((option) => <option key={option.id || "empty"} value={option.id}>{option.label}</option>)}
      </select>
    </Field>
  );
}

const farmerAddressLevels = [
  ["province", "Province (Intara)"],
  ["district", "District (Akarere)"],
  ["sector", "Sector (Umurenge)"],
  ["cell", "Cell (Akagari)"],
  ["village", "Village (Umudugudu)"],
] as const;

type FarmerLevel = (typeof farmerAddressLevels)[number][0];

type FarmerForm = {
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

const emptyFarmerForm: FarmerForm = {
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

export function FarmersPage() {
  const { canWrite, user } = useAuth();
  const request = useRequestId();
  const [form, setForm] = useState<FarmerForm>(emptyFarmerForm);
  const [placeLists, setPlaceLists] = useState<Record<string, string[]> | null>(null);
  const [useLists, setUseLists] = useState(false);
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  function load() {
    api<Farmer[]>("/farmers")
      .then(setFarmers)
      .catch((caught: Error) => setError(caught.message));
  }
  useEffect(load, []);

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
    if (form.province) params.set("province", form.province);
    if (form.district) params.set("district", form.district);
    if (form.sector) params.set("sector", form.sector);
    if (form.cell) params.set("cell", form.cell);
    if ([...params.keys()].length === 0) return;
    let active = true;
    api<{ level: string; places: string[] }>(`/locations?${params}`)
      .then((body) => {
        if (active) setPlaceLists((current) => ({ ...current, [body.level]: body.places }));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [useLists, form.province, form.district, form.sector, form.cell]);

  function setPlace(level: FarmerLevel, value: string) {
    const order: FarmerLevel[] = ["province", "district", "sector", "cell", "village"];
    setForm((current) => {
      const next = { ...current, [level]: value };
      let clear = false;
      for (const name of order) {
        if (clear) next[name] = "";
        if (name === level) clear = true;
      }
      return next;
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const created = await api<Farmer>("/farmers", {
        method: "POST",
        body: JSON.stringify({
          display_name: form.display_name.trim(),
          phone: form.phone.trim() || null,
          province: form.province.trim() || null,
          district: form.district.trim() || null,
          sector: form.sector.trim() || null,
          cell: form.cell.trim() || null,
          village: form.village.trim() || null,
          isibo: form.isibo.trim() || null,
          household: form.household.trim() || null,
          client_request_id: request.current(),
        }),
      });
      setNotice(`${created.display_name} is saved.`);
      setForm(emptyFarmerForm);
      setAdding(false);
      setSelectedId(created.id);
      request.rotate();
      load();
    } catch (caught) {
      setError(message(caught));
    }
  }

  const mine = (user?.role === "field_officer" ? farmers.filter((item) => item.registered_by === user.id) : farmers)
    .slice()
    .sort((left, right) => left.display_name.localeCompare(right.display_name));

  const addForm = (
        <form className="card form" onSubmit={submit}>
          <h2 className="farmer-add-title">Farmer information</h2>
          <Field label="Name" name="display_name">
            <input id="display_name" value={form.display_name} onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))} required />
          </Field>
          <Field label="Phone" name="phone" help="Optional. Treat this as sensitive contact information.">
            <input id="phone" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
          </Field>
          {useLists && placeLists ? (
            <div className="row">
              {farmerAddressLevels.map(([level, text], index) => {
                const parent = index === 0 ? "ready" : form[farmerAddressLevels[index - 1][0]];
                const places = placeLists[level] ?? [];
                return (
                  <Field key={level} label={text} name={level}>
                    <select id={level} value={form[level]} disabled={!parent} onChange={(event) => setPlace(level, event.target.value)}>
                      <option value="">{parent ? "Choose" : "Choose the level above"}</option>
                      {form[level] && !places.includes(form[level]) ? <option value={form[level]}>{form[level]}</option> : null}
                      {places.map((place) => <option key={place} value={place}>{place}</option>)}
                    </select>
                  </Field>
                );
              })}
            </div>
          ) : (
            <>
              <div className="row">
                <Field label="Province (Intara)" name="province"><input id="province" value={form.province} onChange={(event) => setPlace("province", event.target.value)} /></Field>
                <Field label="District (Akarere)" name="district"><input id="district" value={form.district} onChange={(event) => setPlace("district", event.target.value)} /></Field>
              </div>
              <div className="row">
                <Field label="Sector (Umurenge)" name="sector"><input id="sector" value={form.sector} onChange={(event) => setPlace("sector", event.target.value)} /></Field>
                <Field label="Cell (Akagari)" name="cell"><input id="cell" value={form.cell} onChange={(event) => setPlace("cell", event.target.value)} /></Field>
              </div>
              <Field label="Village (Umudugudu)" name="village"><input id="village" value={form.village} onChange={(event) => setPlace("village", event.target.value)} /></Field>
            </>
          )}
          <p className="help">Province through village follow the 2019 national village list. Isibo and household are optional.</p>
          <div className="row">
            <Field label="Isibo" name="isibo"><input id="isibo" value={form.isibo} onChange={(event) => setForm((current) => ({ ...current, isibo: event.target.value }))} /></Field>
            <Field label="Household (Urugo)" name="household"><input id="household" value={form.household} onChange={(event) => setForm((current) => ({ ...current, household: event.target.value }))} /></Field>
          </div>
          <div className="actions">
            <button className="primary" type="submit">Save farmer</button>
            <button className="secondary" type="button" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
  );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Farmers</h1>
          <p className="lede">Farmers you registered. Choose a name to see their place, trees, health, and follow-up. Do not enter a national ID.</p>
        </div>
        {canWrite ? (
          <button
            className="primary"
            type="button"
            aria-expanded={adding}
            onClick={() => {
              setAdding((open) => !open);
              document.getElementById("main")?.scrollIntoView({ block: "start" });
            }}
          >
            + Add a farmer
          </button>
        ) : null}
      </div>
      {notice ? <Banner tone="success">{notice}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      {canWrite && adding ? (
        <div className="farmer-add">
          <RegistrationProgress step={1} steps={["Farmer Information"]} heading="h2" />
          {addForm}
        </div>
      ) : (
        <FarmerBoard farmers={mine} selectedId={selectedId} onSelect={setSelectedId} />
      )}
    </div>
  );
}

export function NurseryPage() {
  const { canWrite } = useAuth();
  const nurseryRequest = useRequestId();
  const lotRequest = useRequestId();
  const distributionRequest = useRequestId();
  const [sites, setSites] = useState<Site[]>([]);
  const [species, setSpecies] = useState<Species[]>([]);
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [lots, setLots] = useState<{ id: string; label: string; nurseryId: string; species: string; remaining: number }[]>([]);
  const [distributions, setDistributions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [siteId, setSiteId] = useState("");
  const [speciesId, setSpeciesId] = useState("");
  const [quantity, setQuantity] = useState("50");
  const [lotId, setLotId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [farmerId, setFarmerId] = useState("");
  const [sendQuantity, setSendQuantity] = useState("10");
  const [nurseryName, setNurseryName] = useState("");
  const [place, setPlace] = useState({ province: "", district: "", sector: "", cell: "", village: "", isibo: "", household: "" });
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [seedlings, setSeedlings] = useState([{ key: "seedling-1", speciesId: "", quantity: "" }]);

  function load() {
    Promise.all([
      api<Page<Site>>("/sites?page_size=100"),
      api<Species[]>("/species?approved=true"),
      api<Farmer[]>("/farmers"),
      api<{ id: string; public_code: string; nursery_site_id: string; species_common_name: string | null; quantity_remaining: number }[]>("/seedling-lots"),
      api<{ public_code: string; quantity: number; destination_site_name: string | null; farmer_name: string | null }[]>("/distributions"),
    ]).then(([sitePage, speciesList, farmerList, lotList, sent]) => {
      setSites(sitePage.items);
      setSpecies(speciesList);
      setFarmers(farmerList);
      setLots(lotList.map((lot) => ({
        id: lot.id,
        nurseryId: lot.nursery_site_id,
        species: lot.species_common_name ?? "Species",
        remaining: lot.quantity_remaining,
        label: `${lot.public_code} · ${lot.species_common_name} · ${lot.quantity_remaining} left`,
      })));
      setDistributions(sent.map((row) => `${row.public_code} · ${row.quantity} to ${row.destination_site_name ?? "site"}${row.farmer_name ? ` · ${row.farmer_name}` : ""}`));
      const nurseries = sitePage.items.filter((site) => site.site_type === "nursery_holding");
      setSiteId((current) => current || nurseries[0]?.id || "");
      setSpeciesId((current) => current || speciesList[0]?.id || "");
      setDestinationId((current) => current || sitePage.items[0]?.id || "");
      setLotId((current) => current || lotList[0]?.id || "");
    }).catch((caught: Error) => setError(caught.message));
  }
  useEffect(load, []);

  function setNurseryPlace(field: keyof typeof place, value: string) {
    if (field === "isibo" || field === "household") {
      setPlace((current) => ({ ...current, [field]: value }));
      return;
    }
    const order = ["province", "district", "sector", "cell", "village"] as const;
    setPlace((current) => {
      const next = { ...current, [field]: value };
      let clear = false;
      for (const name of order) {
        if (clear) next[name] = "";
        if (name === field) clear = true;
      }
      return next;
    });
  }

  async function saveNursery(event: React.FormEvent) {
    event.preventDefault();
    const coordinates = validateCoordinates(latitude, longitude);
    if (coordinates) {
      setError(coordinates);
      return;
    }
    const rows = seedlings.filter((row) => row.speciesId || row.quantity.trim());
    if (rows.length === 0) {
      setError("Add at least one species and how many seedlings the nursery has.");
      return;
    }
    for (const row of rows) {
      const count = Number(row.quantity);
      if (!row.speciesId || !Number.isInteger(count) || count < 1) {
        setError("Each seedling row needs a species and a quantity of at least 1.");
        return;
      }
    }
    setError(null);
    try {
      const created = await api<Site>("/sites", {
        method: "POST",
        body: JSON.stringify({
          name: nurseryName.trim(),
          site_type: "nursery_holding",
          province: place.province.trim() || null,
          district: place.district.trim() || null,
          sector: place.sector.trim() || null,
          cell: place.cell.trim() || null,
          village: place.village.trim() || null,
          isibo: place.isibo.trim() || null,
          household: place.household.trim() || null,
          latitude: optionalNumber(latitude),
          longitude: optionalNumber(longitude),
          client_request_id: nurseryRequest.current(),
        }),
      });
      for (const [index, row] of rows.entries()) {
        await api("/seedling-lots", {
          method: "POST",
          body: JSON.stringify({
            nursery_site_id: created.id,
            species_id: row.speciesId,
            quantity_produced: Number(row.quantity),
            produced_on: todayInput(),
            client_request_id: `${nurseryRequest.current()}-lot-${index}`,
          }),
        });
      }
      setNotice(`${created.name} is saved with its seedlings. You can select them when you register a tree.`);
      setNurseryName("");
      setPlace({ province: "", district: "", sector: "", cell: "", village: "", isibo: "", household: "" });
      setLatitude("");
      setLongitude("");
      setSeedlings([{ key: newRequestId(), speciesId: "", quantity: "" }]);
      setSiteId(created.id);
      nurseryRequest.rotate();
      load();
    } catch (caught) {
      setError(message(caught));
    }
  }

  async function saveLot(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const created = await api<{ public_code: string }>("/seedling-lots", {
        method: "POST",
        body: JSON.stringify({
          nursery_site_id: siteId,
          species_id: speciesId,
          quantity_produced: Number(quantity),
          produced_on: todayInput(),
          client_request_id: lotRequest.current(),
        }),
      });
      setNotice(`${created.public_code} saved.`);
      lotRequest.rotate();
      load();
    } catch (caught) {
      setError(message(caught));
    }
  }

  async function saveDistribution(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const created = await api<{ public_code: string }>("/distributions", {
        method: "POST",
        body: JSON.stringify({
          seedling_lot_id: lotId,
          destination_site_id: destinationId,
          farmer_id: farmerId || null,
          quantity: Number(sendQuantity),
          distributed_on: todayInput(),
          client_request_id: distributionRequest.current(),
        }),
      });
      setNotice(`${created.public_code} distributed.`);
      distributionRequest.rotate();
      load();
    } catch (caught) {
      setError(message(caught));
    }
  }

  const nurseries = sites.filter((site) => site.site_type === "nursery_holding");
  const nurseryChoices = nurseries.map((site) => ({ id: site.id, label: `${site.name} (${site.public_code})` }));
  const siteChoices = sites.map((site) => ({ id: site.id, label: `${site.name} (${site.public_code})` }));
  return (
    <div className="page">
      <h1>Nursery and distribution</h1>
      <p className="lede">Register a nursery with its place and the seedlings it holds. When you register a tree, you can select that nursery and the seedlings recorded here.</p>
      {notice ? <Banner tone="success">{notice}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      {canWrite ? (
        <form className="card form" onSubmit={saveNursery}>
          <h2>Register a nursery</h2>
          <Field label="Nursery name" name="nursery_name">
            <input id="nursery_name" value={nurseryName} onChange={(event) => setNurseryName(event.target.value)} required />
          </Field>
          <TreePlace
            province={place.province}
            district={place.district}
            sector={place.sector}
            cell={place.cell}
            village={place.village}
            isibo={place.isibo}
            household={place.household}
            onChange={setNurseryPlace}
          />
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
              <Field label="Latitude" name="nursery_latitude">
                <input id="nursery_latitude" inputMode="decimal" value={latitude} onChange={(event) => setLatitude(event.target.value)} />
              </Field>
              <Field label="Longitude" name="nursery_longitude">
                <input id="nursery_longitude" inputMode="decimal" value={longitude} onChange={(event) => setLongitude(event.target.value)} />
              </Field>
            </div>
            <p className="help">Filled from the map, or typed here. Leave both empty if this nursery should not appear on the map.</p>
          </div>
          <h2>Seedlings at this nursery</h2>
          <p className="help">Record each species and how many seedlings are there. These are the seedlings you can select when registering a tree.</p>
          {seedlings.map((row, index) => (
            <div className="row" key={row.key}>
              <Field label="Species" name={`seedling_species_${index}`}>
                <select
                  id={`seedling_species_${index}`}
                  value={row.speciesId}
                  onChange={(event) => setSeedlings((current) => current.map((item) => item.key === row.key ? { ...item, speciesId: event.target.value } : item))}
                >
                  <option value="">Choose a species</option>
                  {species.map((item) => <option key={item.id} value={item.id}>{item.common_name}</option>)}
                </select>
              </Field>
              <Field label="Quantity" name={`seedling_quantity_${index}`}>
                <input
                  id={`seedling_quantity_${index}`}
                  inputMode="numeric"
                  value={row.quantity}
                  onChange={(event) => setSeedlings((current) => current.map((item) => item.key === row.key ? { ...item, quantity: event.target.value } : item))}
                />
              </Field>
            </div>
          ))}
          <button
            className="secondary"
            type="button"
            onClick={() => setSeedlings((current) => [...current, { key: newRequestId(), speciesId: "", quantity: "" }])}
          >
            Add another species
          </button>
          <button className="primary" type="submit">Save nursery</button>
        </form>
      ) : null}
      <section className="card">
        <h2>Registered nurseries</h2>
        {nurseries.length === 0 ? <p>No nursery is registered yet.</p> : (
          <ul className="record-list">
            {nurseries.map((site) => {
              const address = [site.province, site.district, site.sector, site.cell, site.village, site.isibo, site.household].filter(Boolean);
              const stock = new Map<string, number>();
              for (const lot of lots.filter((item) => item.nurseryId === site.id)) {
                stock.set(lot.species, (stock.get(lot.species) ?? 0) + lot.remaining);
              }
              const held = [...stock.entries()];
              return (
                <li key={site.id}>
                  <strong>{site.name}</strong>
                  {address.length ? ` · ${address.join(", ")}` : ""}
                  {held.length === 0 ? <p className="help">No seedlings recorded yet.</p> : (
                    <ul>
                      {held.map(([name, count]) => (
                        <li key={name}>{name} · {count === 1 ? "1 seedling left" : `${count} seedlings left`}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {canWrite ? (
        <div className="row">
          <form className="card form" onSubmit={saveLot}>
            <h2>Produce a lot</h2>
            <SelectField label="Nursery" name="nursery_site_id" value={siteId} options={nurseryChoices} onChange={setSiteId} />
            <SelectField label="Species" name="species_id" value={speciesId} options={species.map((item) => ({ id: item.id, label: item.common_name }))} onChange={setSpeciesId} />
            <Field label="Quantity produced" name="quantity_produced"><input id="quantity_produced" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></Field>
            <button className="primary" type="submit">Save seedling lot</button>
          </form>
          <form className="card form" onSubmit={saveDistribution}>
            <h2>Distribute seedlings</h2>
            <SelectField label="Seedling lot" name="seedling_lot_id" value={lotId} options={lots.map((lot) => ({ id: lot.id, label: lot.label }))} onChange={setLotId} />
            <SelectField label="Destination site" name="destination_site_id" value={destinationId} options={siteChoices} onChange={setDestinationId} />
            <SelectField label="Farmer" name="farmer_id" value={farmerId} allowEmpty options={farmers.map((farmer) => ({ id: farmer.id, label: farmer.display_name }))} onChange={setFarmerId} />
            <Field label="Quantity" name="quantity"><input id="quantity" value={sendQuantity} onChange={(event) => setSendQuantity(event.target.value)} /></Field>
            <button className="primary" type="submit">Save distribution</button>
          </form>
        </div>
      ) : null}
      <h2>Lots</h2>
      <SavedList rows={lots.map((lot) => lot.label)} />
      <h2>Distributions</h2>
      <SavedList rows={distributions} />
    </div>
  );
}

export function FieldPage() {
  const { canWrite } = useAuth();
  const [trees, setTrees] = useState<PlantingRecord[]>([]);
  const [batches, setBatches] = useState<PlantingRecord[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [target, setTarget] = useState("");
  const [height, setHeight] = useState("");
  const [activity, setActivity] = useState("pruning");
  const [rows, setRows] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const growthRequest = useRequestId();
  const workRequest = useRequestId();

  function load() {
    Promise.all([
      api<Page<PlantingRecord>>("/trees?page_size=100"),
      api<Page<PlantingRecord>>("/batches?page_size=100"),
      api<Page<Site>>("/sites?page_size=100"),
      api<{ public_code: string; target_code: string | null; height_m: number | null; dbh_cm: number | null }[]>("/growth"),
      api<{ public_code: string; activity_type: string; target_code: string | null }[]>("/maintenance"),
    ]).then(([treePage, batchPage, sitePage, growth, work]) => {
      setTrees(treePage.items);
      setBatches(batchPage.items);
      setSites(sitePage.items);
      const choices = [
        ...treePage.items.map((item) => `tree:${item.id}`),
      ];
      setTarget((current) => current || choices[0] || "");
      setRows([
        ...growth.map((item) => `${item.public_code} · ${item.target_code} · height ${item.height_m ?? "—"} m`),
        ...work.map((item) => `${item.public_code} · ${item.activity_type} · ${item.target_code}`),
      ]);
    }).catch((caught: Error) => setError(caught.message));
  }
  useEffect(load, []);

  const choices: Choice[] = [
    ...trees.map((item) => ({ id: `tree:${item.id}`, label: `${item.public_code} · ${item.species_common_name}` })),
    ...batches.map((item) => ({ id: `batch:${item.id}`, label: `${item.public_code} · ${item.species_common_name}` })),
    ...sites.map((item) => ({ id: `site:${item.id}`, label: `${item.public_code} · ${item.name}` })),
  ];

  async function saveGrowth(event: React.FormEvent) {
    event.preventDefault();
    const [kind, id] = target.split(":");
    if (kind !== "tree" && kind !== "batch") {
      setError("Choose a tree or a batch before saving a measurement.");
      return;
    }
    setError(null);
    try {
      const created = await api<{ public_code: string }>("/growth", {
        method: "POST",
        body: JSON.stringify({
          tree_id: kind === "tree" ? id : null,
          batch_id: kind === "batch" ? id : null,
          measured_on: todayInput(),
          height_m: height ? Number(height) : null,
          client_request_id: growthRequest.current(),
        }),
      });
      setNotice(`${created.public_code} saved.`);
      growthRequest.rotate();
      load();
    } catch (caught) {
      setError(message(caught));
    }
  }

  async function saveWork(event: React.FormEvent) {
    event.preventDefault();
    const [kind, id] = target.split(":");
    if (kind !== "tree" && kind !== "batch" && kind !== "site") {
      setError("Choose a tree, batch, or site before saving maintenance.");
      return;
    }
    setError(null);
    try {
      const created = await api<{ public_code: string }>("/maintenance", {
        method: "POST",
        body: JSON.stringify({
          tree_id: kind === "tree" ? id : null,
          batch_id: kind === "batch" ? id : null,
          site_id: kind === "site" ? id : null,
          activity_type: activity,
          performed_on: todayInput(),
          client_request_id: workRequest.current(),
        }),
      });
      setNotice(`${created.public_code} saved.`);
      workRequest.rotate();
      load();
    } catch (caught) {
      setError(message(caught));
    }
  }

  return (
    <div className="page">
      <h1>Growth and maintenance</h1>
      <p className="lede">Measure a tree or batch, and record pruning, watering, mulching, pest control, or staking.</p>
      {notice ? <Banner tone="success">{notice}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      {canWrite ? (
        <div className="row">
          <form className="card form" onSubmit={saveGrowth}>
            <h2>Growth measurement</h2>
            <SelectField label="Tree or batch" name="growth_target" value={target} options={choices.filter((choice) => !choice.id.startsWith("site:"))} onChange={setTarget} />
            <Field label="Height in metres" name="height_m"><input id="height_m" value={height} onChange={(event) => setHeight(event.target.value)} /></Field>
            <button className="primary" type="submit">Save measurement</button>
          </form>
          <form className="card form" onSubmit={saveWork}>
            <h2>Maintenance</h2>
            <SelectField label="Tree, batch, or site" name="work_target" value={target} options={choices} onChange={setTarget} />
            <Field label="Activity" name="activity_type">
              <select id="activity_type" value={activity} onChange={(event) => setActivity(event.target.value)}>
                <option value="pruning">Pruning</option>
                <option value="watering">Watering</option>
                <option value="mulching">Mulching</option>
                <option value="pest_control">Pest control</option>
                <option value="staking">Staking</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <button className="primary" type="submit">Save maintenance</button>
          </form>
        </div>
      ) : null}
      <SavedList rows={rows} />
    </div>
  );
}

const USES = [
  { id: "sold", label: "Sold" },
  { id: "personal_consumption", label: "Personal consumption" },
  { id: "stored", label: "Stored" },
  { id: "given_away", label: "Given away" },
  { id: "other", label: "Other" },
];

const HARVEST_STEPS = ["Harvest", "Where it went", "Review and submit"] as const;

export function HarvestPage() {
  const { canWrite, user } = useAuth();
  const [trees, setTrees] = useState<PlantingRecord[]>([]);
  const [target, setTarget] = useState("");
  const [quantity, setQuantity] = useState("10");
  const [unit, setUnit] = useState("kg");
  const [harvests, setHarvests] = useState<{ id: string; label: string }[]>([]);
  const [purpose, setPurpose] = useState("sold");
  const [saleQuantity, setSaleQuantity] = useState("1");
  const [amount, setAmount] = useState("0");
  const [buyer, setBuyer] = useState("");
  const [useNote, setUseNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const harvestRequest = useRequestId();
  const saleRequest = useRequestId();

  function load() {
    Promise.all([
      api<Page<PlantingRecord>>("/trees?page_size=100"),
      api<Page<PlantingRecord>>("/batches?page_size=100"),
      api<{ id: string; public_code: string; target_code: string | null; quantity_remaining: number; unit: string }[]>("/harvests"),
    ]).then(([treePage, batchPage, harvestList]) => {
      const planted = [...treePage.items, ...batchPage.items];
      setTrees(planted);
      setTarget((current) => current || (planted[0] ? `${treePage.items.includes(planted[0]) ? "tree" : "batch"}:${planted[0].id}` : ""));
      setHarvests(harvestList.map((item) => ({ id: item.id, label: `${item.public_code} · ${item.quantity_remaining} ${item.unit} left` })));
    }).catch((caught: Error) => setError(caught.message));
  }
  useEffect(load, []);

  function harvestProblem() {
    const [kind] = target.split(":");
    const value = Number(quantity);
    if (kind !== "tree" && kind !== "batch") return "Choose a tree or a batch before saving a harvest.";
    if (!Number.isFinite(value) || value <= 0) return "Quantity must be greater than zero.";
    if (unit === "count" && !Number.isInteger(value)) return "Fruit count must be a whole number.";
    return null;
  }

  function destinationProblem() {
    const value = Number(saleQuantity);
    const harvested = Number(quantity);
    if (!Number.isFinite(value) || value <= 0) return "Quantity must be greater than zero.";
    if (unit === "count" && !Number.isInteger(value)) return "Fruit count must be a whole number.";
    if (value > harvested) return `Only ${harvested} ${unit} remain from this harvest.`;
    if (purpose === "sold" && !buyer.trim()) return "Name the market or organization. Do not enter a national ID.";
    const money = Number(amount);
    if (purpose === "sold" && (!Number.isFinite(money) || money < 0)) return "Amount must be zero or a positive number of Rwandan francs.";
    return null;
  }

  function closeForm() {
    setAdding(false);
    setStep(1);
    setError(null);
    document.getElementById("main")?.scrollIntoView({ block: "start" });
  }

  function goTo(next: 1 | 2 | 3) {
    setStep(next);
    setError(null);
    document.getElementById("main")?.scrollIntoView({ block: "start" });
  }

  async function submit() {
    const problem = harvestProblem() ?? destinationProblem();
    if (problem) {
      setError(problem);
      return;
    }
    const [kind, id] = target.split(":");
    setSaving(true);
    setError(null);
    try {
      const created = await api<{ id: string; public_code: string }>("/harvests", {
        method: "POST",
        body: JSON.stringify({
          tree_id: kind === "tree" ? id : null,
          batch_id: kind === "batch" ? id : null,
          harvested_on: todayInput(),
          quantity: Number(quantity),
          unit,
          client_request_id: harvestRequest.current(),
        }),
      });
      const useRecord = await api<{ public_code: string }>("/sales", {
        method: "POST",
        body: JSON.stringify({
          harvest_id: created.id,
          sold_on: todayInput(),
          quantity: Number(saleQuantity),
          purpose,
          amount_rwf: purpose === "sold" ? Number(amount) : 0,
          buyer_name: purpose === "sold" ? buyer.trim() : null,
          notes: purpose === "sold" ? null : useNote.trim() || null,
          client_request_id: saleRequest.current(),
        }),
      });
      setNotice(`${created.public_code} and ${useRecord.public_code} are saved.`);
      harvestRequest.rotate();
      saleRequest.rotate();
      setQuantity("10");
      setUnit("kg");
      setPurpose("sold");
      setSaleQuantity("1");
      setAmount("0");
      setBuyer("");
      setUseNote("");
      setAdding(false);
      setStep(1);
      setVersion((value) => value + 1);
      load();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setSaving(false);
    }
  }

  const choices = trees.map((item) => ({
    id: `${item.public_code.startsWith("BATCH") ? "batch" : "tree"}:${item.id}`,
    label: `${item.public_code} · ${item.species_common_name}`,
  }));
  const targetLabel = choices.find((item) => item.id === target)?.label ?? "Not chosen";
  const useLabel = USES.find((item) => item.id === purpose)?.label ?? purpose;
  const unitLabel = unit === "kg" ? "Kilograms" : "Fruit count";

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Harvest and sales</h1>
          <p className="lede">Record fruit taken from a tree or batch, then where it went: sold, eaten at home, stored, given away, or another use. The quantities have to add up.</p>
        </div>
        {canWrite ? (
          <button
            className="primary"
            type="button"
            aria-expanded={adding}
            onClick={() => {
              if (adding) closeForm();
              else {
                setAdding(true);
                goTo(1);
              }
            }}
          >
            + Harvest
          </button>
        ) : null}
      </div>
      {notice ? <Banner tone="success">{notice}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      {canWrite && adding ? (
        <div className="farmer-add">
          <RegistrationProgress step={step} steps={HARVEST_STEPS} heading="h2" />
          {step === 1 ? (
            <form className="card form" onSubmit={(event) => { event.preventDefault(); const problem = harvestProblem(); setError(problem); if (!problem) goTo(2); }}>
              <h2 className="farmer-add-title">Harvest</h2>
              <SelectField label="Tree or batch" name="harvest_target" value={target} options={choices} onChange={setTarget} />
              <div className="row">
                <Field label="Quantity" name="harvest_quantity"><input id="harvest_quantity" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></Field>
                <Field label="Unit" name="unit">
                  <select id="unit" value={unit} onChange={(event) => setUnit(event.target.value)}>
                    <option value="kg">Kilograms</option>
                    <option value="count">Fruit count</option>
                  </select>
                </Field>
              </div>
              <div className="actions">
                <button className="primary" type="submit">Continue</button>
                <button className="secondary" type="button" onClick={closeForm}>Cancel</button>
              </div>
            </form>
          ) : null}
          {step === 2 ? (
            <form className="card form" onSubmit={(event) => { event.preventDefault(); const problem = destinationProblem(); setError(problem); if (!problem) goTo(3); }}>
              <h2 className="farmer-add-title">Where it went</h2>
              <Field label="Harvest" name="harvest_preview">
                <input id="harvest_preview" value={`${targetLabel} · ${quantity} ${unit}`} readOnly />
              </Field>
              <Field label="Use" name="purpose">
                <select id="purpose" value={purpose} onChange={(event) => setPurpose(event.target.value)}>
                  {USES.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
                </select>
              </Field>
              <Field label="Quantity" name="sale_quantity"><input id="sale_quantity" value={saleQuantity} onChange={(event) => setSaleQuantity(event.target.value)} /></Field>
              {purpose === "sold" ? (
                <>
                  <Field label="Amount in RWF" name="amount_rwf"><input id="amount_rwf" value={amount} onChange={(event) => setAmount(event.target.value)} /></Field>
                  <Field label="Buyer" name="buyer_name" help="Market or organization name. Do not enter a national ID.">
                    <input id="buyer_name" value={buyer} onChange={(event) => setBuyer(event.target.value)} required />
                  </Field>
                </>
              ) : (
                <Field label="Note" name="use_note" help="Optional. Do not enter a national ID.">
                  <input id="use_note" value={useNote} onChange={(event) => setUseNote(event.target.value)} />
                </Field>
              )}
              <div className="actions">
                <button className="primary" type="submit">Continue</button>
                <button className="secondary" type="button" onClick={() => goTo(1)}>Back</button>
                <button className="secondary" type="button" onClick={closeForm}>Cancel</button>
              </div>
            </form>
          ) : null}
          {step === 3 ? (
            <section className="card">
              <h2 className="farmer-add-title">Review</h2>
              <h3>Harvest</h3>
              <dl className="review-list">
                <div><dt>Tree or batch</dt><dd>{targetLabel}</dd></div>
                <div><dt>Quantity</dt><dd>{quantity}</dd></div>
                <div><dt>Unit</dt><dd>{unitLabel}</dd></div>
              </dl>
              <h3>Where it went</h3>
              <dl className="review-list">
                <div><dt>Harvest</dt><dd>{targetLabel} · {quantity} {unit}</dd></div>
                <div><dt>Use</dt><dd>{useLabel}</dd></div>
                <div><dt>Quantity</dt><dd>{saleQuantity}</dd></div>
                {purpose === "sold" ? (
                  <>
                    <div><dt>Amount in RWF</dt><dd>{amount}</dd></div>
                    <div><dt>Buyer</dt><dd>{buyer.trim()}</dd></div>
                  </>
                ) : (
                  <div><dt>Note</dt><dd>{useNote.trim() || "Not recorded"}</dd></div>
                )}
              </dl>
              <div className="actions">
                <button className="primary" type="button" onClick={() => void submit()} disabled={saving}>{saving ? "Saving…" : "Submit"}</button>
                <button className="secondary" type="button" onClick={() => goTo(2)} disabled={saving}>Back</button>
                <button className="secondary" type="button" onClick={closeForm} disabled={saving}>Cancel</button>
              </div>
            </section>
          ) : null}
        </div>
      ) : (
        <>
          {user?.role === "farmer" || user?.role === "field_officer" ? (
            <section className="card" aria-label="Buyer interest">
              <h2>Buyer interest</h2>
              <p className="help">Requests from viewers. Accepting one does not change the forecast or a recorded harvest.</p>
              <BuyerRequests refreshKey={version} />
            </section>
          ) : null}
          <HarvestForecast refreshKey={version} />
          {user?.role === "field_officer" ? <HarvestNotices refreshKey={version} /> : null}
          <HarvestSummary refreshKey={version} />
          <HarvestFeedback refreshKey={version} harvests={harvests} />
        </>
      )}
    </div>
  );
}

export function AnalyticsPage() {
  return <DashboardView mode="report" />;
}
