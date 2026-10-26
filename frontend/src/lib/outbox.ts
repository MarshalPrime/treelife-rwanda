const KEY = "treelife.outbox";

export type OutboxItem = {
  id: string;
  path: string;
  body: string;
  createdAt: string;
};

export function readOutbox(storage: Pick<Storage, "getItem" | "setItem"> = localStorage): OutboxItem[] {
  try {
    const parsed = JSON.parse(storage.getItem(KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.id === "string" && typeof item.path === "string");
  } catch {
    return [];
  }
}

export function enqueueOutbox(
  path: string,
  body: string,
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
): boolean {
  let parsed: { client_request_id?: string };
  try {
    parsed = JSON.parse(body) as { client_request_id?: string };
  } catch {
    return false;
  }
  if (!parsed.client_request_id) return false;
  const items = readOutbox(storage);
  if (items.some((item) => item.id === parsed.client_request_id)) return true;
  items.push({
    id: parsed.client_request_id,
    path,
    body,
    createdAt: new Date().toISOString(),
  });
  storage.setItem(KEY, JSON.stringify(items));
  return true;
}

export function removeOutbox(id: string, storage: Pick<Storage, "getItem" | "setItem"> = localStorage): void {
  const items = readOutbox(storage).filter((item) => item.id !== id);
  storage.setItem(KEY, JSON.stringify(items));
}
