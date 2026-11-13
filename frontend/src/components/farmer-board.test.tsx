import { useState, type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FarmerBoard } from "@/components/farmer-board";
import type { Farmer } from "@/lib/types";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

function Harness({ farmers }: { farmers: Farmer[] }) {
  const [selectedId, setSelectedId] = useState("");
  return <FarmerBoard farmers={farmers} selectedId={selectedId} onSelect={setSelectedId} />;
}

const farmer: Farmer = {
  id: "farmer-1",
  public_code: "FARM-1",
  display_name: "Aline",
  organization_id: null,
  organization_name: null,
  province: "Eastern",
  district: "Bugesera",
  sector: "Nyamata",
  cell: null,
  village: "Kanazi",
  isibo: null,
  household: null,
  phone: "0700000000",
  notes: null,
  data_origin: "field_entry",
  registered_by: "officer",
  registered_by_name: "Field Officer",
  registered_at: "2026-05-01T00:00:00Z",
  site_count: 1,
  tree_count: 2,
  has_login: false,
  trees: [
    { id: "tree-1", public_code: "TREE-1", species_common_name: "Mango", planting_date: "2026-05-02", status: "surviving", has_coordinates: true },
    { id: "tree-2", public_code: "TREE-2", species_common_name: "Mango", planting_date: "2026-05-03", status: "stressed", has_coordinates: false },
  ],
};

describe("farmer list", () => {
  it("shows the farmers an officer registered and opens one household", async () => {
    const user = userEvent.setup();
    render(<Harness farmers={[farmer]} />);
    expect(screen.getByRole("table", { name: "Farmers you registered" })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Aline/ })).toHaveTextContent("2");
    await user.click(screen.getByRole("button", { name: /Aline/ }));
    expect(screen.getByText(/Phone: 0700000000/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /TREE-1/ })).toHaveAttribute("href", "/trees/tree-1");
    expect(screen.getAllByText("Needs a visit").length).toBeGreaterThan(0);
  });
});
