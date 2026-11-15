import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AgentExplorer } from "@/components/agents";
import type { AgentBoardRow } from "@/lib/types";

const officer: AgentBoardRow = {
  id: "officer-1",
  name: "Test Officer",
  trees_registered: 11,
  checked: 1,
  pending: 10,
  coordinate_percent: 50,
  last_registered_on: "2026-03-01",
  last_submission_on: "2026-04-02",
  submissions: 3,
  districts: ["Bugesera"],
  registrations: [{ day: "2026-03-01", trees: 11 }],
  places: [{ district: "Bugesera", sector: null, village: null, trees: 11 }],
  issues: [
    { id: "tree-1", kind: "tree", code: "TREE-1", title: "Mango", issue: "condition", place: "Bugesera" },
    { id: "tree-2", kind: "tree", code: "TREE-2", title: "Mango", issue: "duplicate", place: "Bugesera" },
  ],
  incomplete: 1,
  duplicates: 1,
  missing_coordinates: 0,
};

describe("agent list", () => {
  it("shows registered, checked, and pending trees for each agent", () => {
    render(<AgentExplorer agents={[officer]} />);
    expect(screen.getByRole("table", { name: "Trees registered by each agent" })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Test Officer/ })).toHaveTextContent("11");
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText(/Bugesera · Sector not recorded · Village not recorded/)).toBeInTheDocument();
  });

  it("switches registration periods and opens a quality list", async () => {
    const user = userEvent.setup();
    render(<AgentExplorer agents={[officer]} />);
    await user.click(screen.getByRole("button", { name: "Daily" }));
    expect(screen.getByText("01-03")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Possible duplicates/ }));
    expect(screen.getByText(/TREE-2/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Test Officer/ }));
    expect(screen.getByRole("heading", { name: "Test Officer" })).toBeInTheDocument();
  });
});
