export const growthForms = [
  ["tree", "Tree"],
  ["shrub", "Shrub"],
  ["herb", "Herb"],
  ["vine", "Vine"],
] as const;

export const speciesClasses = [
  ["fruit", "Fruit tree"],
  ["timber", "Timber tree"],
  ["agroforestry", "Agroforestry tree"],
  ["ornamental", "Ornamental tree"],
  ["indigenous", "Indigenous tree"],
  ["multipurpose", "Multipurpose tree"],
] as const;

export const reviewStatuses = [
  ["verified", "Verified"],
  ["needs_review", "Needs review"],
  ["draft", "Draft"],
  ["rejected", "Rejected"],
] as const;

export function choiceLabel(choices: readonly (readonly [string, string])[], value: string | null | undefined) {
  if (!value) return "Not recorded";
  return choices.find(([id]) => id === value)?.[1] ?? "Not recorded";
}

export function classLabels(values: string[] | null | undefined) {
  if (!values || values.length === 0) return "Not recorded";
  return values.map((value) => choiceLabel(speciesClasses, value)).join(", ");
}
