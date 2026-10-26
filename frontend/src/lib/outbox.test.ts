import { describe, expect, it } from "vitest";
import { enqueueOutbox, readOutbox, removeOutbox } from "@/lib/outbox";

function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe("offline outbox", () => {
  it("keeps one copy of a request and drops it after a successful send", () => {
    const storage = memory();
    const body = JSON.stringify({ name: "Plot", client_request_id: "request-0001" });
    expect(enqueueOutbox("/sites", body, storage)).toBe(true);
    expect(enqueueOutbox("/sites", body, storage)).toBe(true);
    expect(readOutbox(storage)).toHaveLength(1);
    expect(enqueueOutbox("/sites", JSON.stringify({ name: "No id" }), storage)).toBe(false);
    removeOutbox("request-0001", storage);
    expect(readOutbox(storage)).toHaveLength(0);
  });
});
