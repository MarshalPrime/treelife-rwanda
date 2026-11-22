"use client";

import { useI18n, type Language } from "@/lib/i18n";

const choices: Language[] = ["en", "rw", "fr"];

export function LanguageSwitch({ tone = "light", compact = false }: { tone?: "light" | "dark"; compact?: boolean }) {
  const { language, setLanguage, t } = useI18n();
  return (
    <div className={`language-switch is-${tone}${compact ? " is-compact" : ""}`} role="group" aria-label={t("language.label")}>
      {choices.map((choice) => (
        <button
          key={choice}
          type="button"
          aria-pressed={language === choice}
          aria-label={t(`language.${choice}`)}
          onClick={() => setLanguage(choice)}
        >
          {compact ? t(`language.short.${choice}`) : (
            <>
              <span className="language-full">{t(`language.${choice}`)}</span>
              <span className="language-short">{t(`language.short.${choice}`)}</span>
            </>
          )}
        </button>
      ))}
    </div>
  );
}
