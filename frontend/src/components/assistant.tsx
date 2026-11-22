"use client";

import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { Banner } from "@/components/AppShell";
import { ChatText } from "@/components/chat-text";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";

type Turn = { role: "user" | "assistant"; content: string; at: string };

function clock() {
  return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Africa/Kigali" });
}

const STARTER_KEYS: Record<string, MessageKey[]> = {
  farmer: ["assistant.farmer1", "assistant.farmer2"],
  field_officer: ["assistant.officer1", "assistant.officer2"],
  admin: ["assistant.admin1", "assistant.admin2"],
  viewer: ["assistant.viewer1", "assistant.viewer2"],
};

function LeafMark() {
  return (
    <svg className="leaf-mark" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 6c-4.2 4.4-7 7.4-7 11.2a7 7 0 0 0 14 0C23 13.4 20.2 10.4 16 6z" fill="currentColor" />
      <rect x="15" y="21" width="2" height="6" rx="1" fill="currentColor" />
    </svg>
  );
}

export function AssistantWidget() {
  const { user } = useAuth();
  const { t } = useI18n();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const message = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    message.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointer(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div className="assistant-slot" ref={root}>
      {open ? (
        <section className="assistant-panel" id={panelId} aria-label={t("assistant.name")}>
          <header className="assistant-panel-head">
            <LeafMark />
            <strong>{t("assistant.name")}</strong>
            <button className="assistant-close" type="button" aria-label={t("assistant.close")} onClick={() => setOpen(false)}>
              <span aria-hidden="true">×</span>
            </button>
          </header>
          <AssistantChat role={user?.role} inputRef={message} />
        </section>
      ) : (
        <button className="assistant-launcher" type="button" aria-expanded={false} aria-controls={panelId} onClick={() => setOpen(true)}>
          <span className="assistant-face" aria-hidden="true"><LeafMark /></span>
          <span className="assistant-label">
            <strong>{t("assistant.name")}</strong>
            <small>{t("assistant.help")}</small>
          </span>
        </button>
      )}
    </div>
  );
}

export function AssistantPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  return (
    <div className="page">
      <h1>{t("assistant.name")}</h1>
      <p className="lede">{t("assistant.pageLede")}</p>
      <div className="card assistant-card">
        <AssistantChat role={user?.role} />
      </div>
    </div>
  );
}

function BotMessage({ at, children }: { at: string; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="assistant-turn bot">
      <span className="assistant-face" aria-hidden="true"><LeafMark /></span>
      <div className="assistant-stack">
        <p className="assistant-meta">
          <strong>{t("assistant.name")}</strong>
          <span className="assistant-chip">AI</span>
          <time>{at}</time>
        </p>
        {children}
      </div>
    </div>
  );
}

function AssistantChat({
  role,
  inputRef,
}: {
  role: string | undefined;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [thinkingAt, setThinkingAt] = useState("");
  const { t } = useI18n();
  const starters = (STARTER_KEYS[role ?? "farmer"] ?? STARTER_KEYS.farmer).map((key) => t(key));
  const log = useRef<HTMLDivElement>(null);
  const [openedAt] = useState(clock);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [turns, busy]);

  async function ask(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const history = [...turns, { role: "user" as const, content, at: clock() }];
    setTurns(history);
    setDraft("");
    setError(null);
    setThinkingAt(clock());
    setBusy(true);
    try {
      const result = await api<{ reply: string }>("/assistant", {
        method: "POST",
        body: JSON.stringify({ messages: history.slice(-12) }),
      });
      setTurns([...history, { role: "assistant", content: result.reply, at: clock() }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("assistant.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="assistant-log" ref={log} aria-live="polite">
        <BotMessage at={openedAt}>
          <div className="assistant-bubble">{t("assistant.greeting")}</div>
          <div className="assistant-bubble">{t("assistant.help")}</div>
        </BotMessage>
        {turns.map((turn, index) =>
          turn.role === "assistant" ? (
            <BotMessage key={`${turn.role}-${index}`} at={turn.at}>
              <div className="assistant-bubble"><ChatText text={turn.content} /></div>
            </BotMessage>
          ) : (
            <div key={`${turn.role}-${index}`} className="assistant-turn you">
              <p className="assistant-meta"><time>{turn.at}</time> {t("assistant.you")}</p>
              <div className="assistant-bubble">{turn.content}</div>
            </div>
          ),
        )}
        {busy ? (
          <BotMessage at={thinkingAt}>
            <p className="assistant-bubble thinking" role="status">
              {t("assistant.thinking")}
              <span className="beat" aria-hidden="true"><i /><i /><i /></span>
            </p>
          </BotMessage>
        ) : null}
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {turns.length === 0 ? <div className="assistant-starters">
        {starters.map((prompt) => (
          <button key={prompt} className="ghost" type="button" disabled={busy} onClick={() => ask(prompt)}>{prompt}</button>
        ))}
      </div> : null}
      <form className="assistant-compose" onSubmit={(event) => { event.preventDefault(); ask(draft); }}>
        <textarea
          ref={inputRef}
          value={draft}
          aria-label={t("assistant.message")}
          placeholder={t("assistant.placeholder")}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            ask(draft);
          }}
          required
        />
        <button className="assistant-send" type="submit" aria-label={t("assistant.send")} disabled={busy}>
          <span aria-hidden="true">↑</span>
        </button>
      </form>
    </>
  );
}
