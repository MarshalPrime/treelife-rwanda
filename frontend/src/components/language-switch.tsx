"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n, type Language } from "@/lib/i18n";

const choices: Language[] = ["en", "fr", "rw"];

function Flag({ code }: { code: Language }) {
  if (code === "fr") {
    return (
      <svg viewBox="0 0 3 2" aria-hidden="true">
        <rect width="1" height="2" fill="#0055a4" />
        <rect x="1" width="1" height="2" fill="#fff" />
        <rect x="2" width="1" height="2" fill="#ef4135" />
      </svg>
    );
  }
  if (code === "rw") {
    return (
      <svg viewBox="0 0 30 20" aria-hidden="true">
        <rect width="30" height="10" fill="#00a1de" />
        <rect y="10" width="30" height="5" fill="#fad201" />
        <rect y="15" width="30" height="5" fill="#20603d" />
        <circle cx="23.5" cy="5" r="2.1" fill="#fad201" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 60 30" aria-hidden="true">
      <rect width="60" height="30" fill="#012169" />
      <path d="M0 0 L60 30 M60 0 L0 30" stroke="#fff" strokeWidth="6" />
      <path d="M0 0 L60 30 M60 0 L0 30" stroke="#C8102E" strokeWidth="4" />
      <path d="M30 0 V30 M0 15 H60" stroke="#fff" strokeWidth="10" />
      <path d="M30 0 V30 M0 15 H60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  );
}

export function LanguageSwitch({
  tone = "light",
  align = "start",
}: {
  tone?: "light" | "dark";
  align?: "start" | "end";
}) {
  const { language, setLanguage, t } = useI18n();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={root}
      className={`language-switch is-${tone} align-${align}${open ? " is-open" : ""}`}
    >
      <button
        type="button"
        className="language-switch-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t(`language.${language}`)}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="language-flag"><Flag code={language} /></span>
        <span>{t(`language.short.${language}`)}</span>
        <svg className="language-switch-chevron" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 6.5 L8 10.5 L12 6.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <ul className="language-menu" role="listbox" aria-label={t("language.label")}>
          {choices.map((choice) => {
            const selected = choice === language;
            return (
              <li key={choice}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    setLanguage(choice);
                    setOpen(false);
                  }}
                >
                  <span className="language-flag"><Flag code={choice} /></span>
                  <span>{t(`language.${choice}`)}</span>
                  {selected ? (
                    <svg className="language-check" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M3.5 8.2 L6.4 11.2 L12.5 4.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
