"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { categories, label, organizationTypes, siteTypes, treeStatuses } from "@/lib/labels";
import type { Farmer, Organization, Site, Species } from "@/lib/types";
import {
  newRequestId,
  optionalNumber,
  outsideRwanda,
  todayInput,
  validatePlanting,
  validateSite,
  type FieldErrors,
} from "@/lib/validation";
import { Banner, Field, describedBy } from "@/components/AppShell";

const LocationPicker = dynamic(() => import("@/components/LocationPicker"), {
  ssr: false,
  loading: () => <p className="help">Loading the map…</p>,
});

const addressLevels = [
  ["province", "Province (Intara)"],
  ["district", "District (Akarere)"],
  ["sector", "Sector (Umurenge)"],
  ["cell", "Cell (Akagari)"],
  ["village", "Village (Umudugudu)"],
] as const;

function useRequestId() {
  const ref = useRef<string>("");
  if (!ref.current) ref.current = newRequestId();
  return ref.current;
}

export function SiteForm({
  initial,
  organizations,
  farmers = [],
  submitLabel,
  editing = false,
  onSubmit,
  onCreateOrganization,
}: {
  initial?: Partial<Site>;
  organizations: Organization[];
  farmers?: Farmer[];
  submitLabel: string;
  editing?: boolean;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
  onCreateOrganization?: (input: { name: string; org_type: string }) => Promise<Organization>;
}) {
  const requestId = useRequestId();
  const [name, setName] = useState(initial?.name ?? "");
  const [siteType, setSiteType] = useState(initial?.site_type ?? "orchard");
  const [organizationId, setOrganizationId] = useState(initial?.organization_id ?? "");
  const [farmerId, setFarmerId] = useState(initial?.farmer_id ?? "");
  const [province, setProvince] = useState(initial?.province ?? "");
  const [district, setDistrict] = useState(initial?.district ?? "");
  const [sector, setSector] = useState(initial?.sector ?? "");
  const [cell, setCell] = useState(initial?.cell ?? "");
  const [village, setVillage] = useState(initial?.village ?? "");
  const [latitude, setLatitude] = useState(initial?.latitude?.toString() ?? "");
  const [longitude, setLongitude] = useState(initial?.longitude?.toString() ?? "");
  const [area, setArea] = useState(initial?.area_hectares?.toString() ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [status, setStatus] = useState(initial?.status ?? "active");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [addingOrg, setAddingOrg] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [orgType, setOrgType] = useState("cooperative");

  const lat = optionalNumber(latitude);
  const lon = optionalNumber(longitude);
  const showRwandaWarning = lat !== null && lon !== null && outsideRwanda(lat, lon) && !errors.coordinates;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors = validateSite({ name, siteType, latitude, longitude, area });
    setErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    try {
      let selectedOrganization = organizationId || null;
      if (addingOrg && onCreateOrganization) {
        if (!orgName.trim()) {
          setErrors({ organization_id: "Organization name is required." });
          setSaving(false);
          return;
        }
        const created = await onCreateOrganization({ name: orgName.trim(), org_type: orgType });
        selectedOrganization = created.id;
      }
      const payload: Record<string, unknown> = {
        name: name.trim(),
        site_type: siteType,
        organization_id: selectedOrganization,
        farmer_id: farmerId || null,
        province: province.trim() || null,
        district: district.trim() || null,
        sector: sector.trim() || null,
        cell: cell.trim() || null,
        village: village.trim() || null,
        latitude: lat,
        longitude: lon,
        area_hectares: area.trim() ? Number(area) : null,
        notes: notes.trim() || null,
      };
      if (!editing) payload.client_request_id = requestId;
      if (editing) payload.status = status;
      await onSubmit(payload);
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors);
        setFormError(
          error.status === 0
            ? `${error.message} This form keeps the same request id, so a retry will not create a duplicate.`
            : error.message,
        );
      } else {
        setFormError("The site could not be saved.");
      }
      setSaving(false);
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      {formError ? <Banner tone="error">{formError}</Banner> : null}
      {showRwandaWarning ? (
        <Banner tone="warning">These coordinates fall outside Rwanda. Save only if that is intentional.</Banner>
      ) : null}
      <Field label="Site name" name="name" error={errors.name}>
        <input id="name" value={name} onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(errors.name)} aria-describedby={describedBy("name", errors.name)} required />
      </Field>
      <div className="row">
        <Field label="Site type" name="site_type" error={errors.site_type}>
          <select id="site_type" value={siteType} onChange={(event) => setSiteType(event.target.value)}>
            {siteTypes.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </Field>
        <Field label="Responsible organization" name="organization_id" error={errors.organization_id} help="Optional. This is the organization, not a farmer's personal record.">
          <select id="organization_id" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} aria-invalid={Boolean(errors.organization_id)} aria-describedby={describedBy("organization_id", errors.organization_id, "org")}>
            <option value="">No organization</option>
            {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Farmer" name="farmer_id" help="Optional. Use a display name already saved under Farmers. Do not enter a national ID.">
        <select id="farmer_id" value={farmerId} onChange={(event) => setFarmerId(event.target.value)}>
          <option value="">No farmer</option>
          {farmers.map((farmer) => <option key={farmer.id} value={farmer.id}>{farmer.display_name}</option>)}
        </select>
      </Field>
      {onCreateOrganization ? (
        <div>
          <button className="secondary" type="button" onClick={() => setAddingOrg((value) => !value)}>
            {addingOrg ? "Cancel new organization" : "Add an organization"}
          </button>
          {addingOrg ? (
            <div className="row" style={{ marginTop: 12 }}>
              <Field label="Organization name" name="org_name">
                <input id="org_name" value={orgName} onChange={(event) => setOrgName(event.target.value)} />
              </Field>
              <Field label="Organization type" name="org_type">
                <select id="org_type" value={orgType} onChange={(event) => setOrgType(event.target.value)}>
                  {organizationTypes.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                </select>
              </Field>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="row">
        <Field label="Province" name="province"><input id="province" value={province} onChange={(event) => setProvince(event.target.value)} /></Field>
        <Field label="District" name="district"><input id="district" value={district} onChange={(event) => setDistrict(event.target.value)} /></Field>
      </div>
      <div className="row">
        <Field label="Sector" name="sector"><input id="sector" value={sector} onChange={(event) => setSector(event.target.value)} /></Field>
        <Field label="Cell" name="cell"><input id="cell" value={cell} onChange={(event) => setCell(event.target.value)} /></Field>
      </div>
      <Field label="Village" name="village"><input id="village" value={village} onChange={(event) => setVillage(event.target.value)} /></Field>
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
            <input id="latitude" inputMode="decimal" value={latitude} onChange={(event) => setLatitude(event.target.value)} aria-invalid={Boolean(errors.coordinates)} aria-describedby={describedBy("latitude", errors.coordinates, "lat")} />
          </Field>
          <Field label="Longitude" name="longitude">
            <input id="longitude" inputMode="decimal" value={longitude} onChange={(event) => setLongitude(event.target.value)} aria-invalid={Boolean(errors.coordinates)} aria-describedby={describedBy("latitude", errors.coordinates, "lat")} />
          </Field>
        </div>
        <p className="help" id="latitude-help">Decimal degrees, WGS 84. Leave both empty if the point is not known.</p>
        {errors.coordinates ? <p className="error-text" id="latitude-error">{errors.coordinates}</p> : null}
      </div>
      <Field label="Area in hectares" name="area_hectares" error={errors.area_hectares}>
        <input id="area_hectares" inputMode="decimal" value={area} onChange={(event) => setArea(event.target.value)} aria-invalid={Boolean(errors.area_hectares)} aria-describedby={describedBy("area_hectares", errors.area_hectares)} />
      </Field>
      {editing ? (
        <Field label="Status" name="status">
          <select id="status" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
      ) : null}
      <Field label="Notes" name="notes">
        <textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} />
      </Field>
      <button className="primary" type="submit" disabled={saving}>{saving ? "Saving…" : submitLabel}</button>
      <p className="help">Current selection: {label(siteType)}</p>
    </form>
  );
}

export function TreePlace({
  province,
  district,
  sector,
  cell,
  village,
  isibo,
  household,
  districtError,
  onChange,
  help = "Choose from district down to the village. Isibo and household are entered by name. This address belongs to the tree.",
  legend = "Where the tree is",
}: {
  province: string;
  district: string;
  sector: string;
  cell: string;
  village: string;
  isibo: string;
  household: string;
  districtError?: string;
  onChange: (field: "province" | "district" | "sector" | "cell" | "village" | "isibo" | "household", value: string) => void;
  help?: string;
  legend?: string;
}) {
  const address = { province, district, sector, cell, village };
  const [placeLists, setPlaceLists] = useState<Record<string, string[]> | null>(null);
  const [useLists, setUseLists] = useState(false);

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
    const query = new URLSearchParams();
    if (province) query.set("province", province);
    if (district) query.set("district", district);
    if (sector) query.set("sector", sector);
    if (cell) query.set("cell", cell);
    if ([...query.keys()].length === 0) return;
    let active = true;
    api<{ level: string; places: string[] }>(`/locations?${query}`)
      .then((body) => {
        if (active) setPlaceLists((current) => ({ ...current, [body.level]: body.places }));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [useLists, province, district, sector, cell]);

  return (
    <fieldset className="role-choice">
      <legend>{legend}</legend>
      <p className="help">{help}</p>
      {districtError ? <p className="error-text">{districtError}</p> : null}
      {useLists && placeLists ? (
        <div className="row">
          {addressLevels.map(([level, text], index) => {
            const parent = index === 0 ? "ready" : address[addressLevels[index - 1][0]];
            const places = placeLists[level] ?? [];
            const value = address[level];
            return (
              <Field key={level} label={text} name={level}>
                <select id={level} value={value} disabled={!parent} onChange={(event) => onChange(level, event.target.value)}>
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
            <Field label="Province (Intara)" name="province"><input id="province" value={province} onChange={(event) => onChange("province", event.target.value)} /></Field>
            <Field label="District (Akarere)" name="district"><input id="district" value={district} onChange={(event) => onChange("district", event.target.value)} /></Field>
          </div>
          <div className="row">
            <Field label="Sector (Umurenge)" name="sector"><input id="sector" value={sector} onChange={(event) => onChange("sector", event.target.value)} /></Field>
            <Field label="Cell (Akagari)" name="cell"><input id="cell" value={cell} onChange={(event) => onChange("cell", event.target.value)} /></Field>
          </div>
          <Field label="Village (Umudugudu)" name="village"><input id="village" value={village} onChange={(event) => onChange("village", event.target.value)} /></Field>
        </>
      )}
      <p className="help">Province through village follow the 2019 national village list.</p>
      <div className="row">
        <Field label="Isibo" name="isibo"><input id="isibo" value={isibo} onChange={(event) => onChange("isibo", event.target.value)} /></Field>
        <Field label="Household (Urugo)" name="household" help="Optional."><input id="household" value={household} onChange={(event) => onChange("household", event.target.value)} /></Field>
      </div>
    </fieldset>
  );
}

export function PlantingForm({
  mode,
  sites,
  species,
  farmers = [],
  showFarmerHelp = false,
  initial,
  editing = false,
  onSubmit,
}: {
  mode: "tree" | "batch";
  sites: Site[];
  species: Species[];
  farmers?: Farmer[];
  showFarmerHelp?: boolean;
  initial?: Partial<{
    site_id: string | null;
    province: string | null;
    district: string | null;
    sector: string | null;
    cell: string | null;
    village: string | null;
    isibo: string | null;
    household: string | null;
    species_id: string;
    category: string;
    planting_date: string;
    latitude: number | null;
    longitude: number | null;
    quantity: number;
    notes: string | null;
    status: string;
  }>;
  editing?: boolean;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const requestId = useRequestId();
  const [siteId, setSiteId] = useState(initial?.site_id ?? "");
  const [province, setProvince] = useState(initial?.province ?? "");
  const [district, setDistrict] = useState(initial?.district ?? "");
  const [sector, setSector] = useState(initial?.sector ?? "");
  const [cell, setCell] = useState(initial?.cell ?? "");
  const [village, setVillage] = useState(initial?.village ?? "");
  const [isibo, setIsibo] = useState(initial?.isibo ?? "");
  const [household, setHousehold] = useState(initial?.household ?? "");
  const [speciesId, setSpeciesId] = useState(initial?.species_id ?? "");
  const [category, setCategory] = useState(initial?.category ?? "fruit");
  const [plantingDate, setPlantingDate] = useState(initial?.planting_date ?? todayInput());
  const [latitude, setLatitude] = useState(initial?.latitude?.toString() ?? "");
  const [longitude, setLongitude] = useState(initial?.longitude?.toString() ?? "");
  const [quantity, setQuantity] = useState(initial?.quantity?.toString() ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [status, setStatus] = useState(initial?.status ?? "planted");
  const [helping, setHelping] = useState<"none" | "existing" | "new">(showFarmerHelp ? "new" : "none");
  const [farmerId, setFarmerId] = useState("");
  const [farmerName, setFarmerName] = useState("");
  const [farmerDistrict, setFarmerDistrict] = useState("");
  const [farmerPhone, setFarmerPhone] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function useSiteCoordinates() {
    const site = sites.find((item) => item.id === siteId);
    if (!site || site.latitude === null || site.longitude === null) {
      setFormError("The selected site has no coordinates to copy.");
      return;
    }
    setLatitude(String(site.latitude));
    setLongitude(String(site.longitude));
    setFormError(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors = validatePlanting({
      siteId,
      speciesId,
      category,
      plantingDate,
      latitude,
      longitude,
      quantity: mode === "batch" ? quantity : undefined,
    });
    setErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length) return;
    if (showFarmerHelp && !editing && helping === "existing" && !farmerId) {
      setFormError("Choose the farmer you are helping.");
      return;
    }
    if (showFarmerHelp && !editing && helping === "new" && !farmerName.trim()) {
      setFormError("Enter the name of the farmer you are helping.");
      return;
    }
    if (!district.trim()) {
      setErrors({ district: "Choose a district." });
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        site_id: siteId,
        province: province.trim() || null,
        district: district.trim() || null,
        sector: sector.trim() || null,
        cell: cell.trim() || null,
        village: village.trim() || null,
        isibo: isibo.trim() || null,
        household: household.trim() || null,
        species_id: speciesId,
        category,
        planting_date: plantingDate,
        latitude: optionalNumber(latitude),
        longitude: optionalNumber(longitude),
        notes: notes.trim() || null,
        status,
      };
      if (mode === "batch") payload.quantity = Number(quantity);
      if (!editing) payload.client_request_id = requestId;
      if (showFarmerHelp && !editing) {
        payload.farmer_id = helping === "existing" ? farmerId : null;
        payload.new_farmer = helping === "new"
          ? {
              display_name: farmerName.trim(),
              district: farmerDistrict.trim() || null,
              phone: farmerPhone.trim() || null,
            }
          : null;
      }
      await onSubmit(payload);
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors);
        setFormError(
          error.status === 0
            ? `${error.message} This form keeps the same request id, so a retry will not create a duplicate.`
            : error.message,
        );
      } else {
        setFormError("The record could not be saved.");
      }
      setSaving(false);
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      {formError ? <Banner tone="error">{formError}</Banner> : null}
      {species.length === 0 ? <Banner tone="warning">Add a species before registering a tree or batch.</Banner> : null}
      <Field label="Planting site" name="site_id" error={errors.site_id}>
        <select id="site_id" value={siteId} onChange={(event) => setSiteId(event.target.value)} aria-invalid={Boolean(errors.site_id)} aria-describedby={describedBy("site_id", errors.site_id)}>
          <option value="">Choose a site</option>
          {sites.filter((site) => site.site_type !== "nursery_holding").map((site) => <option key={site.id} value={site.id}>{site.name} ({site.public_code})</option>)}
        </select>
      </Field>
      <TreePlace
        province={province}
        district={district}
        sector={sector}
        cell={cell}
        village={village}
        isibo={isibo}
        household={household}
        districtError={errors.district}
        onChange={(field, value) => {
          if (field === "isibo") { setIsibo(value); return; }
          if (field === "household") { setHousehold(value); return; }
          const order = ["province", "district", "sector", "cell", "village"] as const;
          const next = { province, district, sector, cell, village, [field]: value };
          let clear = false;
          for (const name of order) {
            if (clear) next[name] = "";
            if (name === field) clear = true;
          }
          setProvince(next.province);
          setDistrict(next.district);
          setSector(next.sector);
          setCell(next.cell);
          setVillage(next.village);
        }}
      />
      <div className="row">
        <Field label="Species" name="species_id" error={errors.species_id}>
          <select id="species_id" value={speciesId} onChange={(event) => {
            const next = event.target.value;
            setSpeciesId(next);
            const match = species.find((item) => item.id === next);
            if (match) setCategory(match.category);
          }} aria-invalid={Boolean(errors.species_id)} aria-describedby={describedBy("species_id", errors.species_id)}>
            <option value="">Choose a species</option>
            {species.map((item) => <option key={item.id} value={item.id}>{item.common_name}</option>)}
          </select>
        </Field>
        <Field label="Category" name="category" error={errors.category}>
          <select id="category" value={category} onChange={(event) => setCategory(event.target.value)}>
            {categories.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </Field>
      </div>
      <div className="row">
        <Field label="Planting date" name="planting_date" error={errors.planting_date}>
          <input id="planting_date" type="date" value={plantingDate} onChange={(event) => setPlantingDate(event.target.value)} aria-invalid={Boolean(errors.planting_date)} aria-describedby={describedBy("planting_date", errors.planting_date)} />
        </Field>
        {mode === "batch" ? (
          <Field label="Quantity" name="quantity" error={errors.quantity} help="Number of trees in this batch.">
            <input id="quantity" inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} aria-invalid={Boolean(errors.quantity)} aria-describedby={describedBy("quantity", errors.quantity, "qty")} />
          </Field>
        ) : (
          <p className="help">An individual tree is always one tree. Use a planting batch for a group.</p>
        )}
      </div>
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
            <input id="latitude" inputMode="decimal" value={latitude} onChange={(event) => setLatitude(event.target.value)} aria-invalid={Boolean(errors.coordinates)} aria-describedby={describedBy("latitude", errors.coordinates, "lat")} />
          </Field>
          <Field label="Longitude" name="longitude">
            <input id="longitude" inputMode="decimal" value={longitude} onChange={(event) => setLongitude(event.target.value)} aria-invalid={Boolean(errors.coordinates)} aria-describedby={describedBy("latitude", errors.coordinates, "lat")} />
          </Field>
        </div>
        <p className="help" id="latitude-help">Filled from the map, or typed here. Leave both empty if this record should not appear on the map.</p>
        {errors.coordinates ? <p className="error-text" id="latitude-error">{errors.coordinates}</p> : null}
      </div>
      <button className="secondary" type="button" onClick={useSiteCoordinates}>Use site coordinates</button>
      {showFarmerHelp && !editing ? (
        <fieldset className="role-choice">
          <legend>Farmer you are helping</legend>
          <p className="help">An officer names the household. Use an existing farmer, or enter their name. Do not enter a national ID.</p>
          <label>
            <span><input type="radio" name="helping" checked={helping === "none"} onChange={() => setHelping("none")} /> No named farmer</span>
          </label>
          <label>
            <span><input type="radio" name="helping" checked={helping === "existing"} onChange={() => setHelping("existing")} /> A farmer already on the list</span>
          </label>
          {helping === "existing" ? (
            <select aria-label="Existing farmer" value={farmerId} onChange={(event) => setFarmerId(event.target.value)}>
              <option value="">Choose a farmer</option>
              {farmers.map((farmer) => <option key={farmer.id} value={farmer.id}>{farmer.display_name}</option>)}
            </select>
          ) : null}
          <label>
            <span><input type="radio" name="helping" checked={helping === "new"} onChange={() => setHelping("new")} /> Enter a farmer name and information</span>
          </label>
          {helping === "new" ? (
            <>
              <label htmlFor="farmer_name">Farmer name
                <input id="farmer_name" value={farmerName} onChange={(event) => setFarmerName(event.target.value)} />
              </label>
              <label htmlFor="farmer_district">District
                <input id="farmer_district" value={farmerDistrict} onChange={(event) => setFarmerDistrict(event.target.value)} />
              </label>
              <label htmlFor="farmer_phone">Phone
                <input id="farmer_phone" value={farmerPhone} onChange={(event) => setFarmerPhone(event.target.value)} />
              </label>
              <p className="help">Phone is optional and sensitive.</p>
            </>
          ) : null}
        </fieldset>
      ) : null}
      {editing ? (
        <Field label="Status" name="status">
          <select id="status" value={status} onChange={(event) => setStatus(event.target.value)}>
            {treeStatuses.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </Field>
      ) : null}
      <Field label="Notes" name="notes">
        <textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} />
      </Field>
      <button className="primary" type="submit" disabled={saving}>{saving ? "Saving…" : mode === "tree" ? "Save tree" : "Save planting batch"}</button>
    </form>
  );
}
