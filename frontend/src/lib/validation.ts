export type FieldErrors = Record<string, string>;

const SITE_TYPES = new Set([
  "farm",
  "urban_plot",
  "roadside",
  "institution",
  "orchard",
  "nursery_holding",
  "other",
]);

const CATEGORIES = new Set(["urban", "fruit", "agroforestry", "other"]);

export function validateCoordinates(latitudeRaw: string, longitudeRaw: string): string | null {
  const latitudeText = latitudeRaw.trim();
  const longitudeText = longitudeRaw.trim();
  if (!latitudeText && !longitudeText) return null;
  if (!latitudeText || !longitudeText) {
    return "Provide both latitude and longitude, or leave both empty.";
  }
  const latitude = Number(latitudeText);
  const longitude = Number(longitudeText);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return "Latitude must be between -90 and 90.";
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return "Longitude must be between -180 and 180.";
  }
  return null;
}

export function outsideRwanda(latitude: number, longitude: number): boolean {
  return !(latitude >= -2.92 && latitude <= -1.03 && longitude >= 28.85 && longitude <= 30.9);
}

export function validateQuantity(raw: string): string | null {
  if (!/^\d+$/.test(raw.trim())) {
    return "Quantity must be a whole number from 1 to 100000.";
  }
  const quantity = Number(raw);
  if (quantity < 1 || quantity > 100000) {
    return "Quantity must be a whole number from 1 to 100000.";
  }
  return null;
}

function localDate(date: Date): string {
  const copy = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return copy.toISOString().slice(0, 10);
}

export function validateDate(raw: string, label: string): string | null {
  if (!raw) return `${label} is required.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(new Date(`${raw}T00:00:00`).getTime())) {
    return `${label} must be a real date.`;
  }
  if (raw < "1950-01-01") return `${label} must be on or after 1950-01-01.`;
  const latest = new Date();
  latest.setDate(latest.getDate() + 1);
  if (raw > localDate(latest)) return `${label} cannot be in the future.`;
  return null;
}

export function validateSite(input: {
  name: string;
  siteType: string;
  latitude: string;
  longitude: string;
  area: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  if (!input.name.trim()) errors.name = "Name is required.";
  if (!SITE_TYPES.has(input.siteType)) errors.site_type = "Choose a site type.";
  const coordinates = validateCoordinates(input.latitude, input.longitude);
  if (coordinates) errors.coordinates = coordinates;
  if (input.area.trim()) {
    const area = Number(input.area);
    if (!Number.isFinite(area) || area < 0 || area > 100000) {
      errors.area_hectares = "Area must be between 0 and 100000 hectares.";
    }
  }
  return errors;
}

export function validatePlanting(input: {
  siteId: string;
  speciesId: string;
  category: string;
  plantingDate: string;
  latitude: string;
  longitude: string;
  quantity?: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  if (!input.siteId) errors.site_id = "Choose a planting site.";
  if (!input.speciesId) errors.species_id = "Choose a species.";
  if (!CATEGORIES.has(input.category)) errors.category = "Choose a category.";
  const plantingDate = validateDate(input.plantingDate, "Planting date");
  if (plantingDate) errors.planting_date = plantingDate;
  const coordinates = validateCoordinates(input.latitude, input.longitude);
  if (coordinates) errors.coordinates = coordinates;
  if (input.quantity !== undefined) {
    const quantity = validateQuantity(input.quantity);
    if (quantity) errors.quantity = quantity;
  }
  return errors;
}

export function newRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function todayInput(): string {
  return localDate(new Date());
}

export function optionalNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return Number(trimmed);
}
