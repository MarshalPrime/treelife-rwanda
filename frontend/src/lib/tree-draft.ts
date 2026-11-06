export type FarmerChoice = "existing" | "new" | "none";
export type SeedlingOrigin = "nursery" | "farmer" | "natural" | "other" | "";

export type TreeDraft = {
  step: 1 | 2 | 3 | 4 | 5;
  choice: FarmerChoice;
  farmer_id: string | null;
  species_id: string | null;
  variety_id: string | null;
  seedling_origin: SeedlingOrigin;
  nursery_site_id: string | null;
  seedling_lot_id: string | null;
  producer_farmer_id: string | null;
  origin_note: string;
  propagation_method: string;
  seedling_condition: string;
  site_id: string | null;
  province: string;
  district: string;
  sector: string;
  cell: string;
  village: string;
  isibo: string;
  household: string;
  latitude: string;
  longitude: string;
  planting_date: string;
  planting_date_approximate: boolean;
  planting_method: string;
  planting_method_note: string;
  soil_type: string;
  terrain: string;
  water_availability: string;
  spacing: string;
  fertilizer_applied: string;
  mulching_applied: string;
  watering_provided: string;
  planting_notes: string;
};

const DRAFT_KEY = "treelife.tree-draft";
const LEGACY_KEY = "treelife.tree-farmer";

export function emptyDraft(): TreeDraft {
  return {
    step: 1,
    choice: "existing",
    farmer_id: null,
    species_id: null,
    variety_id: null,
    seedling_origin: "",
    nursery_site_id: null,
    seedling_lot_id: null,
    producer_farmer_id: null,
    origin_note: "",
    propagation_method: "",
    seedling_condition: "",
    site_id: null,
    province: "",
    district: "",
    sector: "",
    cell: "",
    village: "",
    isibo: "",
    household: "",
    latitude: "",
    longitude: "",
    planting_date: "",
    planting_date_approximate: false,
    planting_method: "",
    planting_method_note: "",
    soil_type: "",
    terrain: "",
    water_availability: "",
    spacing: "",
    fertilizer_applied: "",
    mulching_applied: "",
    watering_provided: "",
    planting_notes: "",
  };
}

export function clearDraft() {
  sessionStorage.removeItem(DRAFT_KEY);
  sessionStorage.removeItem(LEGACY_KEY);
}

export function readDraft(): TreeDraft {
  if (typeof window === "undefined") return emptyDraft();
  const raw = sessionStorage.getItem(DRAFT_KEY) ?? sessionStorage.getItem(LEGACY_KEY);
  if (!raw) return emptyDraft();
  try {
    return { ...emptyDraft(), ...(JSON.parse(raw) as Partial<TreeDraft>) };
  } catch {
    return emptyDraft();
  }
}

export function writeDraft(patch: Partial<TreeDraft>) {
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...readDraft(), ...patch }));
}
