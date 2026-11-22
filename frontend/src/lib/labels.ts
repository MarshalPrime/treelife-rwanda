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

export type UiLanguage = "en" | "rw" | "fr";

const english = Object.fromEntries(
  [...siteTypes, ...categories, ...treeStatuses, ...siteStatuses, ...organizationTypes, ...eventTypes],
) as Record<string, string>;

const translated: Record<UiLanguage, Record<string, string>> = {
  en: english,
  rw: {
    farm: "Umurima",
    urban_plot: "Umurima w'umujyi",
    roadside: "Inkengero z'umuhanda",
    institution: "Ikigo",
    orchard: "Umurima w'imbuto",
    nursery_holding: "Ah'ingemwe",
    other: "Ikindi",
    urban: "Umujyi",
    fruit: "Imbuto",
    agroforestry: "Ubuhinzi bw'ibiti",
    planted: "Byatewe",
    surviving: "Bikiriho",
    stressed: "Bikeneye",
    dead: "Byapfuye",
    removed: "Byakuweho",
    unknown: "Bitazwi",
    active: "Bikora",
    inactive: "Ntibikora",
    cooperative: "Koperative",
    ngo: "Umuryango",
    public_institution: "Ikigo cya Leta",
    private: "Abigenga",
    community_group: "Itsinda ry'abaturage",
    inspection: "Isuzuma",
    survival_check: "Gusuzuma niba bikiriho",
    maintenance: "Kwita",
    harvest_observation: "Icyitonderwa ku musaruro",
  },
  fr: {
    farm: "Ferme",
    urban_plot: "Parcelle urbaine",
    roadside: "Bord de route",
    institution: "Institution",
    orchard: "Verger",
    nursery_holding: "Parc à plants",
    other: "Autre",
    urban: "Urbain",
    fruit: "Fruitier",
    agroforestry: "Agroforesterie",
    planted: "Planté",
    surviving: "Survivant",
    stressed: "En stress",
    dead: "Mort",
    removed: "Retiré",
    unknown: "Inconnu",
    active: "Actif",
    inactive: "Inactif",
    cooperative: "Coopérative",
    ngo: "ONG",
    public_institution: "Institution publique",
    private: "Privé",
    community_group: "Groupe communautaire",
    inspection: "Visite",
    survival_check: "Contrôle de survie",
    maintenance: "Entretien",
    harvest_observation: "Observation de récolte",
  },
};

let uiLanguage: UiLanguage = "en";

export function setUiLanguage(language: UiLanguage) {
  uiLanguage = language;
}

export function label(value: string | null | undefined): string {
  if (!value) return "—";
  return translated[uiLanguage][value] ?? translated.en[value] ?? value;
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
