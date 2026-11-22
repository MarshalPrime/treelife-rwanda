import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlantingDetail } from "@/components/details";
import type { PlantingRecord } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  role: "field_officer" as "field_officer" | "viewer" | "admin",
  canWrite: true,
}));

vi.mock("@/lib/api", () => ({ api: mocks.api }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { id: "u1", full_name: "Officer", role: mocks.role }, canWrite: mocks.canWrite }),
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "tree-1" }),
  useSearchParams: () => new URLSearchParams(),
}));

const sampleTree: PlantingRecord = {
  id: "tree-1",
  public_code: "TREE-2026-29GHEY",
  site_id: "site-1",
  site_name: "Demo Huye",
  site_code: "SITE-1",
  farmer_id: "f1",
  farmer_name: "Uwimana",
  province: "Southern",
  district: "Huye",
  sector: "Ngoma",
  cell: null,
  village: null,
  isibo: "Isibo 2",
  household: "HH-9",
  species_id: "sp-1",
  species_common_name: "Jacaranda",
  species_scientific_name: "Jacaranda mimosifolia",
  category: "urban",
  planting_date: "2026-01-10",
  planting_method: "transplant",
  soil_type: "loam",
  terrain: "gentle",
  water_availability: "rainfed",
  spacing: "4m x 4m",
  fertilizer_applied: true,
  mulching_applied: false,
  watering_provided: true,
  quantity: 1,
  latitude: null,
  longitude: null,
  has_coordinates: false,
  status: "planted",
  notes: "Initial planting note.",
  data_origin: "field_entry",
  external_id: null,
  registered_by: "u1",
  registered_by_name: "Officer One",
  registered_at: "2026-01-10T09:00:00Z",
  created_at: "2026-01-10T09:00:00Z",
  updated_at: "2026-01-10T09:00:00Z",
};

describe("PlantingDetail", () => {
  beforeEach(() => {
    mocks.api.mockReset();
    mocks.role = "field_officer";
    mocks.canWrite = true;
  });
  afterEach(() => {
    cleanup();
  });

  it("renders planting context, checklist, inline status update, and inline coordinate capture", async () => {
    const user = userEvent.setup();
    mocks.api.mockImplementation((path: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        return Promise.resolve({
          ...sampleTree,
          ...body,
          has_coordinates: body.latitude != null ? true : sampleTree.has_coordinates,
        });
      }
      if (path.startsWith("/events")) return Promise.resolve({ items: [], total: 0, page: 1, page_size: 20 });
      if (path.endsWith("/biography")) {
        return Promise.resolve({
          entries: [{
            id: "plant-1",
            occurred_on: "2026-01-10",
            chapter: "planting",
            title: "Planted",
            detail: "Transplanted from a nursery. Demo Huye",
            public_code: "TREE-2026-29GHEY",
            recorded_by_name: "Officer One",
          }],
        });
      }
      return Promise.resolve(sampleTree);
    });

    render(<PlantingDetail mode="tree" />);
    expect(await screen.findByRole("heading", { name: "Jacaranda" })).toBeInTheDocument();
    expect(screen.getByText("Jacaranda mimosifolia")).toBeInTheDocument();
    expect(screen.getByText("Planting Context")).toBeInTheDocument();
    expect(screen.getByText("Loam")).toBeInTheDocument();
    expect(screen.getByText("3 open")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Tree biography" })).getByText("Planted")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Update status"), "surviving");
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        "/trees/tree-1",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ status: "surviving" }) }),
      ),
    );

    await user.click(screen.getByRole("button", { name: "+ Add coordinates" }));
    await user.type(screen.getByLabelText("Latitude"), "-2.5967");
    await user.type(screen.getByLabelText("Longitude"), "29.7394");
    await user.click(screen.getByRole("button", { name: "Save coordinates" }));

    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        "/trees/tree-1",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ latitude: -2.5967, longitude: 29.7394 }) }),
      ),
    );
  });

  it("redacts farmer, household, and recorder details for viewer accounts", async () => {
    mocks.role = "viewer";
    mocks.canWrite = false;
    mocks.api.mockImplementation((path: string) => {
      if (path.endsWith("/biography")) {
        return Promise.resolve({
          entries: [
            {
              id: "plant-1",
              occurred_on: "2026-01-10",
              chapter: "planting",
              title: "Planted",
              detail: "Demo Huye",
              public_code: "TREE-2026-29GHEY",
              recorded_by_name: null,
            },
            {
              id: "ev-1",
              occurred_on: "2026-02-01",
              chapter: "inspection",
              title: "Inspection",
              detail: "Canopy healthy",
              public_code: "EVT-1",
              recorded_by_name: null,
            },
          ],
        });
      }
      return Promise.resolve(sampleTree);
    });

    render(<PlantingDetail mode="tree" />);
    expect(await screen.findByRole("heading", { name: "Jacaranda" })).toBeInTheDocument();
    expect(screen.queryByText("Uwimana")).not.toBeInTheDocument();
    expect(screen.queryByText("Officer One")).not.toBeInTheDocument();
    expect(screen.queryByText(/Isibo 2/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Add coordinates" })).not.toBeInTheDocument();
  });
});
