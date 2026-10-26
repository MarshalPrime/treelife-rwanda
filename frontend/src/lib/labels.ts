export const siteTypes = [
  ["farm", "Farm"],
  ["urban_plot", "Urban plot"],
  ["roadside", "Roadside"],
  ["institution", "Institution"],
  ["orchard", "Orchard"],
  ["nursery_holding", "Nursery holding"],
  ["other", "Other"],
] as const;

export const categories = [
  ["urban", "Urban"],
  ["fruit", "Fruit"],
  ["agroforestry", "Agroforestry"],
  ["other", "Other"],
] as const;

export const treeStatuses = [
  ["planted", "Planted"],
  ["surviving", "Surviving"],
  ["stressed", "Stressed"],
  ["dead", "Dead"],
  ["removed", "Removed"],
  ["unknown", "Unknown"],
] as const;

export const siteStatuses = [
  ["active", "Active"],
  ["inactive", "Inactive"],
] as const;

export const organizationTypes = [
  ["cooperative", "Cooperative"],
  ["ngo", "NGO"],
  ["public_institution", "Public institution"],
  ["private", "Private"],
  ["community_group", "Community group"],
  ["other", "Other"],
] as const;

export const eventTypes = [
  ["inspection", "Inspection"],
  ["survival_check", "Survival check"],
  ["maintenance", "Maintenance"],
  ["harvest_observation", "Harvest observation"],
  ["other", "Other"],
] as const;

const labels = new Map<string, string>(
  [...siteTypes, ...categories, ...treeStatuses, ...siteStatuses, ...organizationTypes, ...eventTypes].map(
    ([value, label]) => [value, label],
  ),
);

export function label(value: string | null | undefined): string {
  if (!value) return "—";
  return labels.get(value) ?? value;
}

export function formatWhen(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function coordinateText(latitude: number | null, longitude: number | null): string {
  if (latitude === null || longitude === null) return "No coordinates recorded";
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}
