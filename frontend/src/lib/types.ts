export type Role = "admin" | "field_officer" | "farmer" | "viewer";

export type User = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  organization_id: string | null;
  is_active: boolean;
  farmer_id: string | null;
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
  category: string;
};

export type Farmer = {
  id: string;
  public_code: string;
  display_name: string;
  organization_id: string | null;
  organization_name: string | null;
  district: string | null;
  phone: string | null;
  notes: string | null;
  data_origin: string;
  registered_by_name: string | null;
  registered_at: string;
  site_count: number;
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
  site_id: string;
  site_name: string | null;
  site_code: string | null;
  farmer_id: string | null;
  farmer_name: string | null;
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

export type MapFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    id: string;
    kind: "site" | "tree" | "batch";
    public_code: string;
    title: string;
    subtitle: string;
    status: string;
    category: string | null;
    data_origin: string;
    species_common_name: string | null;
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

export type AuditEntry = {
  id: string;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  changed_fields: string[];
  created_at: string;
};
