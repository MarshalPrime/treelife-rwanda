"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { setUiLanguage, type UiLanguage } from "@/lib/labels";
import { catalogs, en, type MessageKey } from "@/lib/messages";

export type Language = UiLanguage;

const STORAGE_KEY = "treelife.language";

const phraseKeys: Record<string, MessageKey> = {
  "When these trees are productive": "phrase.whenProductive",
  "No yield reference yet.": "phrase.noReference",
  "Average of 1 recorded harvest.": "phrase.averageOne",
  "Average from earlier harvests of this species on this farm.": "phrase.averageFarm",
  "Published reference for a productive tree.": "phrase.published",
  "Not yet productive.": "phrase.notYet",
  January: "month.1",
  February: "month.2",
  March: "month.3",
  April: "month.4",
  May: "month.5",
  June: "month.6",
  July: "month.7",
  August: "month.8",
  September: "month.9",
  October: "month.10",
  November: "month.11",
  December: "month.12",
};

const titles: Record<string, { rw: string; fr: string }> = {
  Planted: { rw: "Byatewe", fr: "Planté" },
  "Planted in the ground": { rw: "Byatewe mu butaka", fr: "Planté en pleine terre" },
  "Transplanted from a nursery": { rw: "Byavuye muri pepiniyeri", fr: "Repiqué depuis une pépinière" },
  "Direct seeding": { rw: "Imbuto zaterwe aho", fr: "Semis direct" },
  "Natural regeneration": { rw: "Byameze ubwabyo", fr: "Régénération naturelle" },
  Harvest: { rw: "Umusaruro", fr: "Récolte" },
  "Harvest note": { rw: "Icyitonderwa ku musaruro", fr: "Note de récolte" },
  Sold: { rw: "Byagurishijwe", fr: "Vendu" },
  Inspection: { rw: "Isuzuma", fr: "Visite" },
  "Survival check": { rw: "Gusuzuma niba bikiriho", fr: "Contrôle de survie" },
  Care: { rw: "Kwita", fr: "Entretien" },
  Watering: { rw: "Kuhira", fr: "Arrosage" },
  Fertilizer: { rw: "Ifumbire", fr: "Engrais" },
  "Pesticide or herbicide": { rw: "Umuti w'udukoko cyangwa w'ibyatsi", fr: "Produit contre les ravageurs ou les herbes" },
  Pruning: { rw: "Gukata", fr: "Taille" },
  Weeding: { rw: "Guhingura", fr: "Sarclage" },
  Mulching: { rw: "Gushyira ifumbire y'ibyatsi", fr: "Paillage" },
  Staking: { rw: "Gushigikira", fr: "Tuteurage" },
  "Environmental damage": { rw: "Ibyangiritse bitewe n'ikirere", fr: "Dégât lié au milieu" },
  Observation: { rw: "Icyitonderwa", fr: "Observation" },
  "Other care": { rw: "Kwita ikindi", fr: "Autre entretien" },
  "Personal consumption": { rw: "Byariwe mu rugo", fr: "Consommé à la maison" },
  Stored: { rw: "Byabitswe", fr: "Stocké" },
  "Given away": { rw: "Byahawe", fr: "Donné" },
  "Other use": { rw: "Ikindi gukoresha", fr: "Autre usage" },
};

function fill(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? ""));
}

type I18nApi = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
};

const fallback: I18nApi = {
  language: "en",
  setLanguage: () => undefined,
  t: (key, vars) => fill(en[key], vars),
};

const LanguageContext = createContext<I18nApi | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "rw" || stored === "fr") setLanguageState(stored);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const api = useMemo<I18nApi>(() => ({
    language,
    setLanguage: (next) => {
      setLanguageState(next);
      window.localStorage.setItem(STORAGE_KEY, next);
    },
    t: (key, vars) => fill(catalogs[language][key] ?? en[key], vars),
  }), [language]);

  setUiLanguage(language);

  return <LanguageContext.Provider value={api}>{children}</LanguageContext.Provider>;
}

export function useI18n() {
  return useContext(LanguageContext) ?? fallback;
}

export function localizePhrase(language: Language, text: string) {
  if (!text || language === "en") return text;
  const title = titles[text];
  if (title) return title[language];
  const direct = phraseKeys[text];
  if (direct) return catalogs[language][direct];
  const counted = text.match(/^Average of (\d+) recorded harvests\.$/);
  if (counted) {
    return language === "rw"
      ? `Impuzandengo y'imisaruro ${counted[1]} yanditswe.`
      : `Moyenne de ${counted[1]} récoltes déjà notées.`;
  }
  if (!text.includes(", ")) return text;
  return text.split(", ").map((part) => {
    const key = phraseKeys[part];
    return key ? catalogs[language][key] : part;
  }).join(", ");
}
