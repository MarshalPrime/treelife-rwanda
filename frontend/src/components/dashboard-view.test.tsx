import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardView } from "@/components/dashboard-view";
import type { DashboardResponse, MapFeature, MapResponse, Role } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  search: "",
  listeners: new Set<() => void>(),
  push: vi.fn(),
  user: { id: "u1", full_name: "Programme administrator", role: "admin" },
}));
vi.mock("@/lib/api", () => ({ api: mocks.api }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    usePathname: () => "/dashboard",
    useRouter: () => ({ push: mocks.push }),
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(
      (listener) => { mocks.listeners.add(listener); return () => { mocks.listeners.delete(listener); }; },
      () => mocks.search,
    )),
  };
});
vi.mock("next/dynamic", () => ({
  default: () => ({ features, popupFor }: { features: MapFeature[]; popupFor?: (feature: MapFeature) => ReactNode }) => <div data-testid="map-preview">{features[0] ? popupFor?.(features[0]) : "Map preview"}</div>,
}));

const emptyMap: MapResponse = { type: "FeatureCollection", features: [], unlocated: [], truncated: false };
const quietHarvest = { harvested_kg: 0, harvested_count: 0, sold_kg: 0, sold_count: 0, sales_rwf: 0, personal_kg: 0, personal_count: 0, stored_kg: 0, stored_count: 0, given_kg: 0, given_count: 0, other_kg: 0, other_count: 0, unassigned_kg: 0, unassigned_count: 0, shares: [], history: [] };
const quietCarbon = { total_tonnes_co2e: 0, distinct_trees: 0, distinct_species: 0, agents: 0, accepted_measurements: 0, pending_measurements: 0, correction_measurements: 0, methodology: "chave2014-eq4", methodology_version: "1" };
function dashboardApi(path: string, dashboard: unknown, map: unknown = emptyMap) {
  if (path.startsWith("/harvest-notices")) return Promise.resolve([]);
  if (path.startsWith("/harvests/")) return Promise.resolve(quietHarvest);
  if (path.startsWith("/carbon/overview")) return Promise.resolve(quietCarbon);
  if (path.startsWith("/dashboard/map") || path.startsWith("/map")) return Promise.resolve(map);
  if (path.startsWith("/dashboard")) return Promise.resolve(dashboard);
  return Promise.resolve(map);
}
function response(role: Role = "admin", recorded = 111): DashboardResponse {
  return {
    role, scope_label: "Programme overview", linked: true, includes_demonstration: false,
    generated_at: "2026-11-05T10:00:00Z",
    filters: { district: null, species_id: null, range: "90", start_date: "2026-08-08", end_date: "2026-11-05" },
    options: { districts: ["Huye", "Gasabo"], species: [{ id: "mango", common_name: "Mango" }] },
    summary: { recorded_trees: recorded, standing_trees: recorded, checked_trees: 0, surviving_trees: 0, survival_percent: null, farmers: 7, sites: 3, species: 1, districts: 2, harvested_kg: role === "viewer" ? null : 15, sales_rwf: role === "viewer" ? null : 4000, records_missing_coordinates: 0 },
    series: [{ day: "2026-11-01", planted: 1, activity: 0, harvested_kg: role === "viewer" ? null : 15, sales_rwf: role === "viewer" ? null : 4000 }, { day: "2026-11-02", planted: 0, activity: 1, harvested_kg: role === "viewer" ? null : 0, sales_rwf: role === "viewer" ? null : 0 }],
    species_counts: [{ species_id: "mango", species_common_name: "Mango", trees: recorded }],
    districts: [{ district: "Huye", trees: recorded }],
    recent: [], attention: [], map_query: "/dashboard/map",
  };
}
function navigate(search: string) {
  mocks.search = search;
  mocks.listeners.forEach((listener) => listener());
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  mocks.api.mockReset();
  mocks.push.mockReset();
  mocks.search = "";
  mocks.user.role = "admin";
  mocks.push.mockImplementation((url: string) => navigate(url.split("?")[1] ?? ""));
  mocks.api.mockImplementation((path: string) => dashboardApi(path, response()));
});
afterEach(() => { cleanup(); mocks.listeners.clear(); });

describe("dashboard requests and role behavior", () => {
  it("uses the default 90-day period, current survival labels, and accessible chart tables", async () => {
    const user = userEvent.setup();
    render(<DashboardView />);
    expect(await screen.findAllByText("Not assessed")).toHaveLength(3);
    expect(mocks.api).toHaveBeenCalledWith("/dashboard?range=90", expect.anything());
    expect(screen.getByLabelText("Period")).toHaveValue("90");
    await user.click(screen.getByText("View planting and field activity data table"));
    expect(screen.getByRole("table", { name: /Planting and field activity/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Agents" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tree health" })).toBeInTheDocument();
    expect(screen.getByText("Moderate")).toBeInTheDocument();
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Harvest over time" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sales over time" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Register/ })).not.toBeInTheDocument();
  });

  it("keeps KPI data when the map fails and retries only the map", async () => {
    const user = userEvent.setup();
    let mapCalls = 0;
    mocks.api.mockImplementation((path: string) => {
      if (path.startsWith("/dashboard/map")) return ++mapCalls === 1 ? Promise.reject(new Error("Map offline")) : Promise.resolve(emptyMap);
      return dashboardApi(path, response());
    });
    render(<DashboardView />);
    expect(await screen.findByText("Map offline")).toBeInTheDocument();
    expect(screen.getByText("Trees standing")).toBeInTheDocument();
    expect(screen.getByText(/Live · updated/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry map" }));
    await waitFor(() => expect(screen.queryByText("Map offline")).not.toBeInTheDocument());
    expect(mapCalls).toBe(2);
    expect(mocks.api.mock.calls.filter(([path]) => path.startsWith("/dashboard?"))).toHaveLength(1);
  });

  it("clears a dashboard error after a successful retry", async () => {
    const user = userEvent.setup();
    mocks.api.mockRejectedValueOnce(new Error("Server offline"));
    render(<DashboardView />);
    expect(await screen.findByText("Server offline")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry dashboard" }));
    expect(await screen.findAllByText("Not assessed")).toHaveLength(3);
    expect(screen.queryByText("Server offline")).not.toBeInTheDocument();
  });

  it("discards slow responses for a previous period", async () => {
    const user = userEvent.setup();
    const old = deferred<DashboardResponse>();
    const current = deferred<DashboardResponse>();
    mocks.api.mockImplementation((path: string) => path.includes("/dashboard?range=90") ? old.promise : path.includes("/dashboard?range=30") ? current.promise : dashboardApi(path, response()));
    render(<DashboardView />);
    await user.selectOptions(screen.getByLabelText("Period"), "30");
    await act(async () => { current.resolve(response("admin", 333)); });
    expect(await screen.findByRole("button", { name: "Filter by Mango, 333 trees" })).toBeInTheDocument();
    await act(async () => { old.resolve(response("admin", 999)); });
    expect(screen.queryByRole("button", { name: "Filter by Mango, 999 trees" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Period")).toHaveValue("30");
  });

  it("ignores wrapped errors from an aborted period request", async () => {
    const user = userEvent.setup();
    const old = deferred<DashboardResponse>();
    mocks.api.mockImplementation((path: string) => path.includes("/dashboard?range=90") ? old.promise : dashboardApi(path, response()));
    render(<DashboardView />);
    await user.selectOptions(screen.getByLabelText("Period"), "30");
    expect(await screen.findAllByText("Not assessed")).toHaveLength(3);
    await act(async () => { old.reject(new Error("Could not reach the server")); });
    expect(screen.queryByText("Could not reach the server")).not.toBeInTheDocument();
  });

  it("persists dropdown/bar filters and follows URL history without feedback", async () => {
    const user = userEvent.setup();
    render(<DashboardView />);
    await screen.findAllByText("Not assessed");
    await user.click(screen.getByRole("button", { name: "Filter by Mango, 111 trees" }));
    expect(mocks.search).toContain("species_id=mango");
    await screen.findByRole("button", { name: "Clear species filter" });
    await user.selectOptions(screen.getByLabelText("District"), "Huye");
    expect(mocks.search).toContain("district=Huye");
    await user.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(mocks.search).toBe("");
    const pushCount = mocks.push.mock.calls.length;
    act(() => navigate("range=all&district=Gasabo"));
    await waitFor(() => expect(screen.getByLabelText("District")).toHaveValue("Gasabo"));
    expect(screen.getByLabelText("Period")).toHaveValue("all");
    expect(mocks.push.mock.calls.length).toBe(pushCount);
  });

  it("handles viewer null financial values without exposing private panels or detail requests", async () => {
    mocks.user.role = "viewer";
    const viewer = response("viewer");
    const map = { ...emptyMap, features: [{ type: "Feature", geometry: { type: "Point", coordinates: [30, -2] }, properties: { id: "public-tree", kind: "tree", public_code: "TREE-1", title: "Mango", subtitle: "Huye", status: "surviving", category: "fruit", data_origin: "field_entry", species_common_name: "Mango" } }] } as MapResponse;
    mocks.api.mockImplementation((path: string) => dashboardApi(path, viewer, map));
    render(<DashboardView />);
    expect(await screen.findByRole("link", { name: "Browse trees" })).toBeInTheDocument();
    await screen.findByTestId("map-preview");
    expect(screen.queryByRole("heading", { name: "Harvest over time" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Follow-up" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Agents" })).not.toBeInTheDocument();
    expect(screen.queryByText("Farmers")).not.toBeInTheDocument();
    expect(mocks.api.mock.calls.some(([path]) => path.startsWith("/trees/"))).toBe(false);
    expect(screen.queryByText(/not linked/)).not.toBeInTheDocument();
  });

  it("displays the household-link warning only for an unlinked farmer", async () => {
    mocks.user.role = "farmer";
    mocks.api.mockImplementation((path: string) => dashboardApi(path, { ...response("farmer"), linked: false }));
    render(<DashboardView />);
    expect(await screen.findByText(/Your login is not linked/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Register a tree/ })).toBeInTheDocument();
  });

  it("retains nursery balances and production breakdowns in Reports", async () => {
    const report = { ...response(), value_chain: { seedlings_remaining: 6, seedlings_distributed: 4, unsold_kg: 7, advisories: 1, harvest_by_species: [{ species_common_name: "Mango", harvested_kg: 15, harvested_count: 0 }] } };
    mocks.api.mockImplementation((path: string) => dashboardApi(path, report));
    render(<DashboardView mode="report" />);
    expect(await screen.findByText("Seedlings in nursery")).toBeInTheDocument();
    expect(screen.getByText("Seedlings distributed")).toBeInTheDocument();
    expect(screen.getByText("Harvest not yet sold")).toBeInTheDocument();
    expect(screen.getByText("Advice notes")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /Harvest by species/ })).toBeInTheDocument();
  });

  it("shows a bounded error instead of an endless loader for an invalid map contract", async () => {
    const invalid = { ...response(), map_query: "/map", filters: { ...response().filters, start_date: "invalid", end_date: "" } };
    mocks.api.mockImplementation((path: string) => dashboardApi(path, invalid));
    render(<DashboardView />);
    expect(await screen.findByText("Locations are unavailable for this view.")).toBeInTheDocument();
    expect(screen.getByText(/Date unavailable.*Date unavailable/)).toBeInTheDocument();
    expect(screen.queryByText("Loading locations…")).not.toBeInTheDocument();
    expect(mocks.api.mock.calls.some(([path]) => path === "/map")).toBe(false);
  });

  it("opens and exits full-screen tree count projection and renders compact interactive panels", async () => {
    const user = userEvent.setup();
    const harvestData = {
      ...quietHarvest,
      harvested_kg: 12,
      sold_kg: 8,
      sales_rwf: 3200,
      unassigned_kg: 4,
      shares: [{
        public_code: "HARV-1",
        target_code: "TREE-1",
        harvested_on: "2026-11-01",
        quantity: 12,
        unit: "kg",
        sold: 8,
        personal_consumption: 0,
        stored: 0,
        given_away: 0,
        other: 0,
        unassigned: 4,
        balanced: true,
        recorded_by: "Officer",
      }],
      history: [{
        public_code: "HARV-1",
        kind: "harvest",
        occurred_on: "2026-11-01",
        target_code: "TREE-1",
        quantity: 12,
        unit: "kg",
        purpose: null,
        amount_rwf: null,
        buyer_name: null,
        recorded_by: "Officer",
        harvest_code: null,
      }],
    };
    mocks.api.mockImplementation((path: string) => {
      if (path.startsWith("/harvests/")) return Promise.resolve(harvestData);
      return dashboardApi(path, response("admin", 1250));
    });

    render(<DashboardView />);
    expect((await screen.findAllByText("1,250")).length).toBeGreaterThan(0);

    // Open and exit full-screen projection stage
    await user.click(screen.getByRole("button", { name: "Open full-screen projection" }));
    expect(screen.getByRole("dialog", { name: "Full-screen live tree count projection" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Exit full screen/ }));
    expect(screen.queryByRole("dialog", { name: "Full-screen live tree count projection" })).not.toBeInTheDocument();

    // Compact carbon info icon toggle
    await user.click(screen.getByRole("button", { name: "Carbon monitoring details" }));
    expect(screen.getByText(/Standing stock estimate/)).toBeInTheDocument();

    // Interactive chart legend toggle
    const plantedToggle = screen.getByRole("button", { name: "Trees planted" });
    expect(plantedToggle).toHaveAttribute("aria-pressed", "true");
    await user.click(plantedToggle);
    expect(plantedToggle).toHaveAttribute("aria-pressed", "false");

    // Tabbed harvest summary switching
    await user.click(screen.getByRole("tab", { name: /Distribution/ }));
    expect(screen.getByRole("table", { name: /How each harvest is split/ })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /History/ }));
    expect(screen.getByText(/Harvest 12 kg/)).toBeInTheDocument();
  });

  it("streams live tree counts automatically and refreshes dashboard figures when totals change", async () => {
    sessionStorage.setItem("treelife.token", "admin-jwt");
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
    const encoder = new TextEncoder();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            start(controller) {
              streamController = controller;
              controller.enqueue(
                encoder.encode(
                  'event: trees\ndata: {"standing_trees":111,"recorded_trees":111,"healthy_trees":0,"moderate_trees":0,"critical_trees":0,"generated_at":"2026-11-21T10:00:00Z"}\n\n',
                ),
              );
            },
          }),
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        ),
      ),
    );

    render(<DashboardView />);
    expect((await screen.findAllByText("111")).length).toBeGreaterThan(0);

    mocks.api.mockImplementation((path: string) => dashboardApi(path, response("admin", 120)));
    await act(async () => {
      streamController!.enqueue(
        encoder.encode(
          'event: trees\ndata: {"standing_trees":120,"recorded_trees":120,"healthy_trees":0,"moderate_trees":0,"critical_trees":0,"generated_at":"2026-11-21T10:00:05Z"}\n\n',
        ),
      );
    });

    await waitFor(() => expect(screen.getByText(/\+9 trees/)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Filter by Mango, 120 trees" })).toBeInTheDocument());
    streamController!.close();
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("deduplicates follow-up items and toggles between unified, action items, search clear, and list view", async () => {
    const user = userEvent.setup();
    const withAttention: DashboardResponse = {
      ...response("admin", 50),
      attention: [
        { id: "t1", kind: "tree", title: "Jacaranda", reason: "stressed", public_code: "TREE-1", status: "stressed", place: "Huye" },
        { id: "t1", kind: "tree", title: "Jacaranda", reason: "missing_coordinates", public_code: "TREE-1", status: "stressed", place: "Huye" },
        { id: "t2", kind: "tree", title: "Grevillea", reason: "missing_coordinates", public_code: "TREE-2", status: "planted", place: "Musanze" },
      ],
    };
    mocks.api.mockImplementation((path: string) => dashboardApi(path, withAttention));

    render(<DashboardView />);
    await screen.findByText("TREE-1");

    // Deduplicated to 2 cards by default; TREE-1 has both pills
    expect(screen.getAllByText("TREE-1")).toHaveLength(1);
    expect(screen.getAllByText(/Visit due/)).toHaveLength(2);
    expect(screen.getAllByText(/No coords/)).toHaveLength(3);
    expect(screen.getByText(/unique records · Click any card/)).toHaveTextContent("Showing 2 unique records");

    // Switching to Action Items expands to raw entries
    await user.click(screen.getByRole("button", { name: "Action Items" }));
    expect(screen.getAllByText("TREE-1")).toHaveLength(2);
    expect(screen.getByText(/action items · Click any card/)).toHaveTextContent("Showing 3 action items");

    // Switching back collapses duplicates
    await user.click(screen.getByRole("button", { name: "Unified" }));
    expect(screen.getAllByText("TREE-1")).toHaveLength(1);

    // Search filters to Grevillea and inline clear restores all
    await user.type(screen.getByLabelText("Search follow-up records"), "Musanze");
    expect(screen.queryByText("TREE-1")).not.toBeInTheDocument();
    expect(screen.getByText("TREE-2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear follow-up search" }));
    expect(screen.getByText("TREE-1")).toBeInTheDocument();

    // Switch to list view
    await user.click(screen.getByRole("button", { name: "List view" }));
    expect(screen.getByRole("table", { name: "Follow-up records" })).toBeInTheDocument();
  });

  it("renders recent plantings as a compact audit-style line-by-line list and protects viewer privacy", async () => {
    const withRecent: DashboardResponse = {
      ...response("admin", 50),
      recent: [
        { id: "tree-1", kind: "tree", title: "Avocado", site_name: "Huye Demo Plot", status: "surviving", planting_date: "2026-11-04", quantity: 1, public_code: "TREE-2026-AVO1" },
        { id: "batch-2", kind: "batch", title: "Grevillea", site_name: "Nyagatare Agro", status: "stressed", planting_date: "2026-11-02", quantity: 40, public_code: "BATCH-2026-GRV2" },
      ],
    };
    mocks.api.mockImplementation((path: string) => dashboardApi(path, withRecent));

    render(<DashboardView />);
    const recentRegion = await screen.findByRole("region", { name: "Recent plantings" });
    const links = within(recentRegion).getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "/trees/tree-1");
    expect(links[1]).toHaveAttribute("href", "/batches/batch-2");
    expect(within(recentRegion).getByText("Huye Demo Plot")).toBeInTheDocument();
    expect(within(recentRegion).getByText("×40")).toBeInTheDocument();
    expect(within(recentRegion).getByText(/^4 Nov/)).toBeInTheDocument();

    cleanup();
    mocks.user.role = "viewer";
    const viewerRecent: DashboardResponse = {
      ...response("viewer", 50),
      recent: withRecent.recent.map((row) => ({ ...row, site_name: null })),
    };
    mocks.api.mockImplementation((path: string) => dashboardApi(path, viewerRecent));

    render(<DashboardView />);
    const viewerRegion = await screen.findByRole("region", { name: "Recent plantings" });
    expect(within(viewerRegion).queryAllByRole("link")).toHaveLength(0);
    expect(within(viewerRegion).getByText("Avocado")).toBeInTheDocument();
    expect(within(viewerRegion).getByText("×40")).toBeInTheDocument();
    expect(within(viewerRegion).queryByText("Huye Demo Plot")).not.toBeInTheDocument();
    expect(within(viewerRegion).queryByText("TREE-2026-AVO1")).not.toBeInTheDocument();
    expect(within(viewerRegion).queryByText("Location not recorded")).not.toBeInTheDocument();
  });
});
