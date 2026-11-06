import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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
  mocks.api.mockImplementation((path: string) => Promise.resolve(path.startsWith("/dashboard?") ? response() : emptyMap));
});
afterEach(() => { cleanup(); mocks.listeners.clear(); });

describe("dashboard requests and role behavior", () => {
  it("uses the default 90-day period, current survival labels, and accessible chart tables", async () => {
    const user = userEvent.setup();
    render(<DashboardView />);
    expect(await screen.findAllByText("Not assessed")).toHaveLength(2);
    expect(mocks.api).toHaveBeenCalledWith("/dashboard?range=90", expect.anything());
    expect(screen.getByLabelText("Period")).toHaveValue("90");
    await user.click(screen.getByText("View planting and field activity data table"));
    expect(screen.getByRole("table", { name: /Planting and field activity/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Harvest over time" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sales over time" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Register/ })).not.toBeInTheDocument();
  });

  it("keeps KPI data when the map fails and retries only the map", async () => {
    const user = userEvent.setup();
    let mapCalls = 0;
    mocks.api.mockImplementation((path: string) => path.startsWith("/dashboard?") ? Promise.resolve(response()) : ++mapCalls === 1 ? Promise.reject(new Error("Map offline")) : Promise.resolve(emptyMap));
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
    expect(await screen.findAllByText("Not assessed")).toHaveLength(2);
    expect(screen.queryByText("Server offline")).not.toBeInTheDocument();
  });

  it("discards slow responses for a previous period", async () => {
    const user = userEvent.setup();
    const old = deferred<DashboardResponse>();
    const current = deferred<DashboardResponse>();
    mocks.api.mockImplementation((path: string) => path.includes("/dashboard?range=90") ? old.promise : path.includes("/dashboard?range=30") ? current.promise : Promise.resolve(emptyMap));
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
    mocks.api.mockImplementation((path: string) => path.includes("/dashboard?range=90") ? old.promise : Promise.resolve(path.startsWith("/dashboard?") ? response() : emptyMap));
    render(<DashboardView />);
    await user.selectOptions(screen.getByLabelText("Period"), "30");
    expect(await screen.findAllByText("Not assessed")).toHaveLength(2);
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
    mocks.api.mockImplementation((path: string) => Promise.resolve(path.startsWith("/dashboard?") ? viewer : map));
    render(<DashboardView />);
    expect(await screen.findByRole("link", { name: "Browse trees" })).toBeInTheDocument();
    await screen.findByTestId("map-preview");
    expect(screen.queryByRole("heading", { name: "Harvest over time" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Follow-up" })).not.toBeInTheDocument();
    expect(screen.queryByText("Farmers")).not.toBeInTheDocument();
    expect(mocks.api.mock.calls.some(([path]) => path.startsWith("/trees/"))).toBe(false);
    expect(screen.queryByText(/not linked/)).not.toBeInTheDocument();
  });

  it("displays the household-link warning only for an unlinked farmer", async () => {
    mocks.user.role = "farmer";
    mocks.api.mockImplementation((path: string) => Promise.resolve(path.startsWith("/dashboard?") ? { ...response("farmer"), linked: false } : emptyMap));
    render(<DashboardView />);
    expect(await screen.findByText(/Your login is not linked/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Register a tree/ })).toBeInTheDocument();
  });

  it("retains nursery balances and production breakdowns in Reports", async () => {
    const report = { ...response(), value_chain: { seedlings_remaining: 6, seedlings_distributed: 4, unsold_kg: 7, advisories: 1, harvest_by_species: [{ species_common_name: "Mango", harvested_kg: 15, harvested_count: 0 }] } };
    mocks.api.mockImplementation((path: string) => Promise.resolve(path.startsWith("/dashboard?") ? report : emptyMap));
    render(<DashboardView mode="report" />);
    expect(await screen.findByText("Seedlings in nursery")).toBeInTheDocument();
    expect(screen.getByText("Seedlings distributed")).toBeInTheDocument();
    expect(screen.getByText("Harvest not yet sold")).toBeInTheDocument();
    expect(screen.getByText("Advice notes")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /Harvest by species/ })).toBeInTheDocument();
  });

  it("shows a bounded error instead of an endless loader for an invalid map contract", async () => {
    const invalid = { ...response(), map_query: "/map", filters: { ...response().filters, start_date: "invalid", end_date: "" } };
    mocks.api.mockImplementation((path: string) => Promise.resolve(path.startsWith("/dashboard?") ? invalid : emptyMap));
    render(<DashboardView />);
    expect(await screen.findByText("Locations are unavailable for this view.")).toBeInTheDocument();
    expect(screen.getByText(/Date unavailable.*Date unavailable/)).toBeInTheDocument();
    expect(screen.queryByText("Loading locations…")).not.toBeInTheDocument();
    expect(mocks.api.mock.calls.some(([path]) => path === "/map")).toBe(false);
  });
});
