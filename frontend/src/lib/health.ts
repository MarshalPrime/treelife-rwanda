import type { MapFeature } from "@/lib/types";

export type HealthId = "healthy" | "attention" | "dead" | "unknown";

export type Health = {
  id: HealthId;
  label: string;
  hint: string;
  color: string;
  soft: string;
};

const HEALTH: Record<HealthId, Health> = {
  healthy: { id: "healthy", label: "Healthy", hint: "Growing normally", color: "#1f8a4c", soft: "#e7f6ec" },
  attention: { id: "attention", label: "Needs attention", hint: "Inspection or follow-up", color: "#c49212", soft: "#fbf3dc" },
  dead: { id: "dead", label: "Dead", hint: "Died", color: "#c44536", soft: "#fdecea" },
  unknown: { id: "unknown", label: "Not assessed", hint: "No health check yet", color: "#8b9390", soft: "#f1f3f2" },
};

export const healthLevels = [HEALTH.healthy, HEALTH.attention, HEALTH.dead, HEALTH.unknown];
export const siteColor = "#1c4636";

export function healthOf(status: string | null | undefined): Health {
  if (status === "surviving") return HEALTH.healthy;
  if (status === "stressed") return HEALTH.attention;
  if (status === "dead") return HEALTH.dead;
  return HEALTH.unknown;
}

export function markerColor(feature: MapFeature) {
  if (feature.properties.kind === "site") return siteColor;
  return healthOf(feature.properties.status).color;
}

export function matchesHealth(feature: MapFeature, health: HealthId | "") {
  if (!health) return true;
  if (feature.properties.kind === "site") return false;
  return healthOf(feature.properties.status).id === health;
}

export function plantedAge(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "";
  const planted = new Date(year, month - 1, day);
  const now = new Date();
  const months = (now.getFullYear() - planted.getFullYear()) * 12 + now.getMonth() - planted.getMonth();
  if (months < 1) return "This month";
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"}`;
}
