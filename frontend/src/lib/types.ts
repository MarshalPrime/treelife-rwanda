export type AgentIssueKind = "condition" | "visit" | "coordinates" | "incomplete" | "duplicate";

export type AgentBoardRow = {
  id: string;
  name: string;
  trees_registered: number;
  checked: number;
  pending: number;
  coordinate_percent: number;
  last_registered_on: string;
  last_submission_on: string;
  submissions: number;
  districts: string[];
  registrations: { day: string; trees: number }[];
  places: { district: string; sector: string | null; village: string | null; trees: number }[];
  issues: { id: string; kind: "tree" | "batch"; code: string | null; title: string; issue: AgentIssueKind; place: string | null }[];
  incomplete: number;
  duplicates: number;
  missing_coordinates: number;
};

export type AgentBoardResponse = {
  generated_at: string;
  districts: string[];
  species: { id: string; common_name: string }[];
  agents: AgentBoardRow[];
};

export type Role = "admin" | "field_officer" | "farmer" | "viewer";

export type User = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  organization_id: string | null;
  is_active: boolean;
  farmer_id: string | null;
  profile_photo_at: string | null;
  carbon_monitoring?: "not_requested" | "pending" | "approved" | "rejected" | "revoked";
};

export type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  role: Role;
  full_name: string;
};

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
};

export type Organization = {
  id: string;
  name: string;
  org_type: string;
  external_id: string | null;
  notes: string | null;
};

export type Species = {
  id: string;
  scientific_name: string;
  common_name: string;
  local_name: string | null;
  other_local_names?: string[] | null;
  category: string;
  growth_form?: string | null;
  classifications?: string[] | null;
  primary_uses?: string | null;
  harvest_potential?: boolean | null;
  harvest_type?: string | null;
  rwanda_suitability?: string | null;
  data_source?: string | null;
  review_status?: string;
  taxon_rank?: string;
  varieties?: { id: string; name: string }[];
};

export type Farmer = {
  id: string;
  public_code: string;
  display_name: string;
  organization_id: string | null;
  organization_name: string | null;
  province: string | null;
  district: string | null;
  sector: string | null;
  cell: string | null;
  village: string | null;
  isibo: string | null;
  household: string | null;
  phone: string | null;
  notes: string | null;
  data_origin: string;
  registered_by: string | null;
  registered_by_name: string | null;
  registered_at: string;
  site_count: number;
  tree_count: number;
  trees: { id: string; public_code: string; species_common_name: string | null; planting_date: string; status: string; has_coordinates: boolean }[];
  has_login: boolean;
};

export type Site = {
  id: string;
  public_code: string;
  name: string;
  site_type: string;
  organization_id: string | null;
  organization_name: string | null;
  farmer_id: string | null;
  farmer_name: string | null;
  province: string | null;
  district: string | null;
  sector: string | null;
  cell: string | null;
  village: string | null;
  isibo: string | null;
  household: string | null;
  latitude: number | null;
  longitude: number | null;
  has_coordinates: boolean;
  area_hectares: number | null;
  notes: string | null;
  status: string;
  data_origin: string;
  external_id: string | null;
  registered_by: string;
  registered_by_name: string | null;
  registered_at: string;
  created_at: string;
  updated_at: string;
};

export type PlantingRecord = {
  id: string;
  public_code: string;
  site_id: string | null;
  site_name: string | null;
  site_code: string | null;
  farmer_id: string | null;
  farmer_name: string | null;
  province: string | null;
  district: string | null;
  sector: string | null;
  cell: string | null;
  village: string | null;
  isibo: string | null;
  household: string | null;
  species_id: string;
  species_common_name: string | null;
  species_scientific_name: string | null;
  category: string;
  planting_date: string;
  quantity: number;
  latitude: number | null;
  longitude: number | null;
  has_coordinates: boolean;
  status: string;
  notes: string | null;
  data_origin: string;
  external_id: string | null;
  registered_by: string;
  registered_by_name: string | null;
  registered_at: string;
  created_at: string;
  updated_at: string;
};

export type LifecycleEvent = {
  id: string;
  public_code: string;
  tree_id: string | null;
  batch_id: string | null;
  site_id: string | null;
  event_type: string;
  event_date: string;
  status_after: string | null;
  survival_count: number | null;
  notes: string | null;
  data_origin: string;
  recorded_by_name: string | null;
  created_at: string;
};

export type MapGeometry =
  | { type: "Point"; coordinates: [number, number] }
  | { type: "Polygon"; coordinates: [number, number][][] };

export type MapFeature = {
  type: "Feature";
  geometry: MapGeometry;
  properties: {
    id: string;
    kind: "site" | "tree" | "batch" | "forest";
    public_code: string;
    title: string;
    subtitle: string;
    status: string;
    category: string | null;
    data_origin: string;
    species_common_name: string | null;
    area_hectares?: number | null;
    estimated_trees?: number | null;
    distribution?: string | null;
  };
};

export type MapResponse = {
  type: "FeatureCollection";
  features: MapFeature[];
  unlocated: { id: string; kind: string; public_code: string; title: string; reason: string }[];
  truncated: boolean;
};

export type Stats = {
  sites: number;
  trees: number;
  batches: number;
  events: number;
  records_missing_coordinates: number;
  synthetic_records: number;
};

export type SpeciesCount = { species_common_name: string; trees: number };
export type ActivitySlice = { species_common_name: string; checks: number };
export type ActivityDay = { day: string; checks: number; by_species: ActivitySlice[] };
export type DashboardAnalytics = {
  farmers: number;
  seedlings_distributed: number;
  harvested_kg: number;
  sales_rwf: number;
  recorded_trees: number;
  checked_trees: number;
  survival_percent: number | null;
  sites: number;
  sites_visited: number;
  includes_demonstration: boolean;
  species_counts: SpeciesCount[];
  activity: ActivityDay[];
};

export type DashboardRange = "30" | "90" | "ytd" | "all";
export type DashboardFilters = {
  district: string;
  species_id: string;
  range: DashboardRange;
  start_date?: string;
  end_date?: string;
};
export type DashboardResponse = {
  role: Role;
  scope_label: string;
  linked: boolean;
  includes_demonstration: boolean;
  generated_at: string;
  filters: { district: string | null; species_id: string | null; range: DashboardRange; start_date: string; end_date: string };
  options: { districts: string[]; species: { id: string; common_name: string }[] };
  summary: {
    recorded_trees: number;
    standing_trees?: number;
    checked_trees: number;
    surviving_trees: number;
    survival_percent: number | null;
    healthy_trees?: number;
    moderate_trees?: number;
    critical_trees?: number;
    farmers: number;
    sites: number;
    species: number;
    districts: number;
    harvested_kg?: number | null;
    sales_rwf?: number | null;
    records_missing_coordinates: number;
  };
  series: { day: string; planted: number; activity: number; harvested_kg: number | null; sales_rwf: number | null }[];
  species_counts: { species_id: string; species_common_name: string; trees: number }[];
  districts: { district: string; trees: number }[];
  recent: { id: string; kind: "tree" | "batch"; title: string; site_name: string | null; status: string; planting_date: string; quantity: number; public_code?: string | null }[];
  attention: { id: string; kind: "site" | "tree" | "batch"; title: string; reason: "stressed" | "missing_coordinates"; public_code?: string | null; status?: string | null; place?: string | null }[];
  agents?: { id: string; name: string; trees_registered: number; checked: number; pending: number; coordinate_percent: number; last_registered_on: string; districts: string[] }[];
  map_query: string;
  value_chain?: { seedlings_remaining: number; seedlings_distributed: number; unsold_kg: number; advisories: number; harvest_by_species: { species_common_name: string; harvested_kg: number; harvested_count: number }[] } | null;
};

export type AuditEntry = {
  id: string;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  changed_fields: string[];
  created_at: string;
};
