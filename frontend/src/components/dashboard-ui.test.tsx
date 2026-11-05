import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardKpi, DashboardFilters, MiniBarChart } from "@/components/dashboard-ui";

describe("dashboard UI primitives", () => {
  it("renders safe KPI values and explicit filter controls", () => {
    render(<><DashboardKpi label="Survival" value="Not assessed" /><DashboardFilters value="90" onChange={() => undefined} options={[{ value: "90", label: "Last 90 days" }]} /></>);
    expect(screen.getByText("Not assessed")).toBeInTheDocument();
    expect(screen.getByLabelText("Time range")).toHaveValue("90");
  });

  it("renders zero values without inventing a nonzero bar", () => {
    render(<MiniBarChart values={[0]} labels={["Jan"]} />);
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("Jan")).toBeInTheDocument();
    expect(screen.getByRole("img").querySelector(".mini-bar")).toHaveStyle({ height: "0%" });
  });
});
