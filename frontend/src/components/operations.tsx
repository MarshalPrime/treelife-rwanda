"use client";

import { useEffect, useRef, useState } from "react";
import { Banner, Field } from "@/components/AppShell";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { newRequestId, todayInput } from "@/lib/validation";
import type { Farmer, Page, PlantingRecord, Site, Species } from "@/lib/types";

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

export function FarmersPage() {
  const { canWrite, user } = useAuth();
  const canOpenLogin = user?.role === "field_officer";
  const request = useRequestId();
  const [name, setName] = useState("");
  const [district, setDistrict] = useState("");
  const [phone, setPhone] = useState("");
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [loginFarmerId, setLoginFarmerId] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api<Farmer[]>("/farmers")
      .then((items) => {
        setFarmers(items);
        setLoginFarmerId((current) => current || items.find((item) => !item.has_login)?.id || items[0]?.id || "");
      })
      .catch((caught: Error) => setError(caught.message));
  }
  useEffect(load, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const created = await api<Farmer>("/farmers", {
        method: "POST",
        body: JSON.stringify({
          display_name: name,
          district: district || null,
          phone: phone || null,
          client_request_id: request.current(),
        }),
      });
      setNotice(`${created.public_code} saved.`);
      setName("");
      request.rotate();
      load();
    } catch (caught) {
      setError(message(caught));
    }
  }

  return (
    <div className="page">
      <h1>Farmers</h1>
      <p className="lede">A display name for the household or producer. An officer can open a login so that farmer can register trees. Do not enter a national ID.</p>
      {notice ? <Banner tone="success">{notice}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      {canWrite ? (
        <form className="card form" onSubmit={submit}>
          <Field label="Name" name="display_name">
            <input id="display_name" value={name} onChange={(event) => setName(event.target.value)} required />
          </Field>
          <div className="row">
            <Field label="District" name="district"><input id="district" value={district} onChange={(event) => setDistrict(event.target.value)} /></Field>
            <Field label="Phone" name="phone" help="Optional. Treat this as sensitive contact information.">
              <input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
            </Field>
          </div>
          <button className="primary" type="submit">Save farmer</button>
        </form>
      ) : null}
      {canOpenLogin ? (
        <form
          className="card form"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            try {
              const account = await api<{ email: string }>(`/farmers/${loginFarmerId}/login`, {
                method: "POST",
                body: JSON.stringify({ email: loginEmail, password: loginPassword }),
              });
              setNotice(`Login opened for ${account.email}.`);
              setLoginEmail("");
              setLoginPassword("");
              load();
            } catch (caught) {
              setError(message(caught));
            }
          }}
        >
          <h2>Open a farmer login</h2>
          <SelectField
            label="Farmer"
            name="login_farmer_id"
            value={loginFarmerId}
            options={farmers.map((farmer) => ({
              id: farmer.id,
              label: `${farmer.display_name}${farmer.has_login ? " · login open" : ""}`,
            }))}
            onChange={setLoginFarmerId}
          />
          <div className="row">
            <Field label="Email" name="login_email">
              <input id="login_email" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} required />
            </Field>
            <Field label="First password" name="login_password" help="At least 8 characters. Give this to the farmer in person.">
              <input id="login_password" type="password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} required />
            </Field>
          </div>
          <button className="primary" type="submit">Open login</button>
        </form>
      ) : null}
      <SavedList rows={farmers.map((item) => `${item.public_code} · ${item.display_name}${item.district ? ` · ${item.district}` : ""}${item.has_login ? " · can sign in" : ""}`)} />
    </div>
  );
}

export function NurseryPage() {
  const { canWrite } = useAuth();
  const lotRequest = useRequestId();
  const distributionRequest = useRequestId();
  const [sites, setSites] = useState<Site[]>([]);
  const [species, setSpecies] = useState<Species[]>([]);
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [lots, setLots] = useState<{ id: string; label: string; remaining: number }[]>([]);
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

  function load() {
    Promise.all([
      api<Page<Site>>("/sites?page_size=100"),
      api<Species[]>("/species"),
      api<Farmer[]>("/farmers"),
      api<{ id: string; public_code: string; species_common_name: string | null; quantity_remaining: number }[]>("/seedling-lots"),
      api<{ public_code: string; quantity: number; destination_site_name: string | null; farmer_name: string | null }[]>("/distributions"),
    ]).then(([sitePage, speciesList, farmerList, lotList, sent]) => {
      setSites(sitePage.items);
      setSpecies(speciesList);
      setFarmers(farmerList);
      setLots(lotList.map((lot) => ({ id: lot.id, label: `${lot.public_code} · ${lot.species_common_name} · ${lot.quantity_remaining} left`, remaining: lot.quantity_remaining })));
      setDistributions(sent.map((row) => `${row.public_code} · ${row.quantity} to ${row.destination_site_name ?? "site"}${row.farmer_name ? ` · ${row.farmer_name}` : ""}`));
      setSiteId((current) => current || sitePage.items[0]?.id || "");
      setSpeciesId((current) => current || speciesList[0]?.id || "");
      setDestinationId((current) => current || sitePage.items[0]?.id || "");
      setLotId((current) => current || lotList[0]?.id || "");
    }).catch((caught: Error) => setError(caught.message));
  }
  useEffect(load, []);

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

  const siteChoices = sites.map((site) => ({ id: site.id, label: `${site.name} (${site.public_code})` }));
  return (
    <div className="page">
      <h1>Nursery and distribution</h1>
      <p className="lede">Record seedlings produced at a nursery site, then move a quantity to a planting site.</p>
      {notice ? <Banner tone="success">{notice}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      {canWrite ? (
        <div className="row">
          <form className="card form" onSubmit={saveLot}>
            <h2>Produce a lot</h2>
            <SelectField label="Nursery site" name="nursery_site_id" value={siteId} options={siteChoices} onChange={setSiteId} />
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

export function HarvestPage() {
  const { canWrite } = useAuth();
  const [trees, setTrees] = useState<PlantingRecord[]>([]);
  const [target, setTarget] = useState("");
  const [quantity, setQuantity] = useState("10");
  const [unit, setUnit] = useState("kg");
  const [harvests, setHarvests] = useState<{ id: string; label: string }[]>([]);
  const [harvestId, setHarvestId] = useState("");
  const [saleQuantity, setSaleQuantity] = useState("1");
  const [amount, setAmount] = useState("0");
  const [buyer, setBuyer] = useState("");
  const [sales, setSales] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const harvestRequest = useRequestId();
  const saleRequest = useRequestId();

  function load() {
    Promise.all([
      api<Page<PlantingRecord>>("/trees?page_size=100"),
      api<Page<PlantingRecord>>("/batches?page_size=100"),
      api<{ id: string; public_code: string; target_code: string | null; quantity_remaining: number; unit: string }[]>("/harvests"),
      api<{ public_code: string; quantity: number; unit: string; amount_rwf: number; buyer_name: string }[]>("/sales"),
    ]).then(([treePage, batchPage, harvestList, saleList]) => {
      const planted = [...treePage.items, ...batchPage.items];
      setTrees(planted);
      setTarget((current) => current || (planted[0] ? `${treePage.items.includes(planted[0]) ? "tree" : "batch"}:${planted[0].id}` : ""));
      setHarvests(harvestList.map((item) => ({ id: item.id, label: `${item.public_code} · ${item.quantity_remaining} ${item.unit} left` })));
      setHarvestId((current) => current || harvestList[0]?.id || "");
      setSales(saleList.map((item) => `${item.public_code} · ${item.quantity} ${item.unit} · ${item.amount_rwf} RWF · ${item.buyer_name}`));
    }).catch((caught: Error) => setError(caught.message));
  }
  useEffect(load, []);

  async function saveHarvest(event: React.FormEvent) {
    event.preventDefault();
    const [kind, id] = target.split(":");
    if (kind !== "tree" && kind !== "batch") {
      setError("Choose a tree or a batch before saving a harvest.");
      return;
    }
    setError(null);
    try {
      const created = await api<{ public_code: string }>("/harvests", {
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
      setNotice(`${created.public_code} saved.`);
      harvestRequest.rotate();
      load();
    } catch (caught) {
      setError(message(caught));
    }
  }

  async function saveSale(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!harvestId) {
      setError("Record a harvest before recording a sale.");
      return;
    }
    try {
      const created = await api<{ public_code: string }>("/sales", {
        method: "POST",
        body: JSON.stringify({
          harvest_id: harvestId,
          sold_on: todayInput(),
          quantity: Number(saleQuantity),
          amount_rwf: Number(amount),
          buyer_name: buyer,
          client_request_id: saleRequest.current(),
        }),
      });
      setNotice(`${created.public_code} saved.`);
      saleRequest.rotate();
      load();
    } catch (caught) {
      setError(message(caught));
    }
  }

  const choices = trees.map((item) => ({
    id: `${item.public_code.startsWith("BATCH") ? "batch" : "tree"}:${item.id}`,
    label: `${item.public_code} · ${item.species_common_name}`,
  }));

  return (
    <div className="page">
      <h1>Harvest and sales</h1>
      <p className="lede">Record fruit taken from a tree or batch, then record what was sold and for how many Rwandan francs.</p>
      {notice ? <Banner tone="success">{notice}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      {canWrite ? (
        <div className="row">
          <form className="card form" onSubmit={saveHarvest}>
            <h2>Harvest</h2>
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
            <button className="primary" type="submit">Save harvest</button>
          </form>
          <form className="card form" onSubmit={saveSale}>
            <h2>Sale</h2>
            <SelectField label="Harvest" name="harvest_id" value={harvestId} options={harvests.map((item) => ({ id: item.id, label: item.label }))} onChange={setHarvestId} />
            <Field label="Quantity sold" name="sale_quantity"><input id="sale_quantity" value={saleQuantity} onChange={(event) => setSaleQuantity(event.target.value)} /></Field>
            <Field label="Amount in RWF" name="amount_rwf"><input id="amount_rwf" value={amount} onChange={(event) => setAmount(event.target.value)} /></Field>
            <Field label="Buyer" name="buyer_name" help="Market or organization name. Do not enter a national ID.">
              <input id="buyer_name" value={buyer} onChange={(event) => setBuyer(event.target.value)} required />
            </Field>
            <button className="primary" type="submit">Save sale</button>
          </form>
        </div>
      ) : null}
      <h2>Sales</h2>
      <SavedList rows={sales} />
    </div>
  );
}

export function AdvicePage() {
  const { canWrite } = useAuth();
  const request = useRequestId();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [rows, setRows] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function load() {
    api<{ public_code: string; title: string; farmer_name: string | null; issued_on: string }[]>("/advisories")
      .then((items) => setRows(items.map((item) => `${item.public_code} · ${item.title}${item.farmer_name ? ` · ${item.farmer_name}` : ""}`)))
      .catch((caught: Error) => setError(caught.message));
  }
  useEffect(load, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const created = await api<{ public_code: string }>("/advisories", {
        method: "POST",
        body: JSON.stringify({ title, body, issued_on: todayInput(), client_request_id: request.current() }),
      });
      setNotice(`${created.public_code} saved.`);
      setTitle("");
      setBody("");
      request.rotate();
      load();
    } catch (caught) {
      setError(message(caught));
    }
  }

  return (
    <div className="page">
      <h1>Advice</h1>
      <p className="lede">Write a short recommendation an officer can show to a farmer or attach to a site later.</p>
      {notice ? <Banner tone="success">{notice}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      {canWrite ? (
        <form className="card form" onSubmit={submit}>
          <Field label="Title" name="title"><input id="title" value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
          <Field label="Advice" name="body"><textarea id="body" value={body} onChange={(event) => setBody(event.target.value)} required /></Field>
          <button className="primary" type="submit">Save advice</button>
        </form>
      ) : null}
      <SavedList rows={rows} />
    </div>
  );
}

type Analytics = {
  farmers: number;
  seedlings_remaining: number;
  seedlings_distributed: number;
  growth_measurements: number;
  maintenance_activities: number;
  harvested_kg: number;
  unsold_kg: number;
  sales_rwf: number;
  advisories: number;
  trees: number;
  surviving_trees: number;
  by_species: { species_common_name: string; harvested_kg: number; harvested_count: number }[];
  by_district: { district: string; sites: number }[];
};

export function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Analytics>("/analytics").then(setData).catch((caught: Error) => setError(caught.message));
  }, []);
  const survival = data && data.trees > 0 ? Math.round((data.surviving_trees / data.trees) * 100) : 0;
  return (
    <div className="page">
      <h1>Reports</h1>
      <p className="lede">Counts from the records in this database. They describe what has been entered, not a national survey.</p>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {data ? (
        <>
          <section className="stats" aria-label="Value chain counts">
            <div className="stat"><strong>{data.farmers}</strong><span>Farmers</span></div>
            <div className="stat"><strong>{data.seedlings_remaining}</strong><span>Seedlings still in nursery</span></div>
            <div className="stat"><strong>{data.seedlings_distributed}</strong><span>Seedlings distributed</span></div>
            <div className="stat"><strong>{survival}%</strong><span>Individual trees marked surviving</span></div>
            <div className="stat"><strong>{data.harvested_kg}</strong><span>Kilograms harvested</span></div>
            <div className="stat"><strong>{data.unsold_kg}</strong><span>Kilograms not yet sold</span></div>
            <div className="stat"><strong>{data.sales_rwf}</strong><span>Sales in RWF</span></div>
            <div className="stat"><strong>{data.advisories}</strong><span>Advice notes</span></div>
          </section>
          <div className="card">
            <h2>Harvest by species</h2>
            {data.by_species.length === 0 ? <p>No harvests yet.</p> : (
              <ul>{data.by_species.map((row) => <li key={row.species_common_name}>{row.species_common_name}: {row.harvested_kg} kg, {row.harvested_count} fruit</li>)}</ul>
            )}
            <h2>Sites by district</h2>
            {data.by_district.length === 0 ? <p>No district has been entered.</p> : (
              <ul>{data.by_district.map((row) => <li key={row.district}>{row.district}: {row.sites}</li>)}</ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
