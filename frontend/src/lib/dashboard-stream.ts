const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
const TOKEN_KEY = "treelife.token";

function readToken(): string | null {
  if (typeof window === "undefined" || typeof sessionStorage === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export type LiveTreeSnapshot = {
  standing_trees: number;
  recorded_trees: number;
  healthy_trees: number;
  moderate_trees: number;
  critical_trees: number;
  generated_at: string;
};

export type LiveStreamState = "connecting" | "live" | "polling" | "offline";

export type StreamHandlers = {
  onSnapshot: (snapshot: LiveTreeSnapshot) => void;
  onStateChange: (state: LiveStreamState) => void;
};

function parseSseBlock(block: string): { event: string; data: string } | null {
  let eventName = "message";
  const dataLines: string[] = [];
  for (const rawLine of block.split(/\r?\n/)) {
    if (!rawLine || rawLine.startsWith(":")) continue;
    const colon = rawLine.indexOf(":");
    const field = (colon === -1 ? rawLine : rawLine.slice(0, colon)).trim();
    const value = colon === -1 ? "" : rawLine.slice(colon + 1).replace(/^ /, "");
    if (field === "event") eventName = value;
    if (field === "data") dataLines.push(value);
  }
  if (!dataLines.length) return null;
  return { event: eventName, data: dataLines.join("\n") };
}

/**
 * Subscribe to the backend SSE stream for live tree totals using Bearer auth.
 * Falls back cleanly to polling mode when offline, unauthenticated, or disconnected.
 */
export function connectDashboardStream(
  query: string,
  { onSnapshot, onStateChange }: StreamHandlers,
): () => void {
  if (typeof window === "undefined" || typeof fetch !== "function") {
    onStateChange("polling");
    return () => undefined;
  }

  let closed = false;
  let retryAttempt = 0;
  let retryTimer: number | null = null;
  let activeController: AbortController | null = null;

  const clearRetry = () => {
    if (retryTimer !== null) {
      window.clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (closed) return;
    clearRetry();
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      onStateChange("offline");
      return;
    }
    onStateChange("polling");
    const delay = Math.min(15000, 3000 * 2 ** retryAttempt);
    retryAttempt = Math.min(retryAttempt + 1, 3);
    retryTimer = window.setTimeout(() => {
      void start();
    }, delay);
  };

  const start = async () => {
    if (closed) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      onStateChange("offline");
      return;
    }
    const token = readToken();
    if (!token) {
      onStateChange("polling");
      return;
    }

    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    onStateChange("connecting");

    try {
      const url = `${API_URL}/api/v1/dashboard/stream${query ? `?${query}` : ""}`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "text/event-stream",
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        scheduleReconnect();
        return;
      }

      retryAttempt = 0;
      onStateChange("live");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (!closed) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split(/\r?\n\r?\n/);
        buffer = parts.pop() ?? "";
        for (const block of parts) {
          const parsed = parseSseBlock(block);
          if (!parsed || parsed.event !== "trees") continue;
          try {
            const snapshot = JSON.parse(parsed.data) as LiveTreeSnapshot;
            if (typeof snapshot.standing_trees === "number") {
              onSnapshot(snapshot);
            }
          } catch {
            // Ignore malformed event frames rather than tearing down the stream.
          }
        }
      }

      if (!closed && !controller.signal.aborted) {
        scheduleReconnect();
      }
    } catch {
      if (!closed && !controller.signal.aborted) {
        scheduleReconnect();
      }
    }
  };

  const onOnline = () => {
    if (closed) return;
    retryAttempt = 0;
    clearRetry();
    void start();
  };

  const onOffline = () => {
    if (closed) return;
    clearRetry();
    activeController?.abort();
    onStateChange("offline");
  };

  const onVisible = () => {
    if (!closed && document.visibilityState === "visible" && retryTimer !== null) {
      retryAttempt = 0;
      clearRetry();
      void start();
    }
  };

  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisible);
  void start();

  return () => {
    closed = true;
    clearRetry();
    activeController?.abort();
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
