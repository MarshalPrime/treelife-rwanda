export const plantingMethods = [
  ["ground", "Direct planting in the ground"],
  ["transplant", "Transplanting from a nursery"],
  ["direct_seeding", "Direct seeding"],
  ["natural", "Natural regeneration"],
  ["other", "Other"],
] as const;

export const soilTypes = [
  ["clay", "Clay"],
  ["sandy", "Sandy"],
  ["loam", "Loam"],
  ["rocky", "Rocky"],
  ["other", "Other"],
  ["unknown", "Unknown"],
] as const;

export const terrains = [
  ["flat", "Flat"],
  ["gentle", "Gentle slope"],
  ["steep", "Steep slope"],
  ["other", "Other"],
  ["unknown", "Unknown"],
] as const;

export const waterSources = [
  ["rainfed", "Rainfed"],
  ["nearby", "Nearby water source"],
  ["irrigation", "Irrigation"],
  ["limited", "Limited"],
  ["unknown", "Unknown"],
] as const;

export const yesNoUnknown = [
  ["yes", "Yes"],
  ["no", "No"],
  ["unknown", "Unknown"],
] as const;

export function choiceLabel(options: readonly (readonly [string, string])[], value: string) {
  return options.find(([id]) => id === value)?.[1] ?? value;
}
