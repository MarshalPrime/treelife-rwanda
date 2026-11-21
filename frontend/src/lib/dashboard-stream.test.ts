import { afterEach, describe, expect, it, vi } from "vitest";
import { connectDashboardStream } from "@/lib/dashboard-stream";

function sseResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  let index = 0;
  return new Response(
    new ReadableStream({
      pull(controller) {
        if (index < chunks.length) {
          controller.enqueue(encoder.encode(chunks[index++]));
        } else {
          controller.close();
        }
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );
}

describe("connectDashboardStream", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("parses SSE tree events split across chunks and sends bearer auth", async () => {
    sessionStorage.setItem("treelife.token", "test-jwt");
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        "event: trees\ndata: {\"standing_trees\": 120,",
        " \"recorded_trees\": 125, \"healthy_trees\": 100, \"moderate_trees\": 20, \"critical_trees\": 5, \"generated_at\": \"2026-11-21T10:00:00Z\"}\n\n: heartbeat\n\n",
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const onSnapshot = vi.fn();
    const onStateChange = vi.fn();
    const disconnect = connectDashboardStream("district=Huye", { onSnapshot, onStateChange });

    await vi.waitFor(() => {
      expect(onSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({ standing_trees: 120, recorded_trees: 125 }),
      );
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/dashboard/stream?district=Huye"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-jwt" }),
      }),
    );
    expect(onStateChange).toHaveBeenCalledWith("live");
    disconnect();
  });

  it("falls back to polling when no auth token is present", () => {
    const onSnapshot = vi.fn();
    const onStateChange = vi.fn();
    const disconnect = connectDashboardStream("", { onSnapshot, onStateChange });
    expect(onStateChange).toHaveBeenCalledWith("polling");
    expect(onSnapshot).not.toHaveBeenCalled();
    disconnect();
  });
});
