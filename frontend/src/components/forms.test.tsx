import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SiteForm } from "@/components/forms";
import { validatePlanting, validateQuantity, validateSite } from "@/lib/validation";

describe("registration validation", () => {
  it("requires a site name and a coordinate pair", () => {
    expect(validateSite({ name: "  ", siteType: "orchard", latitude: "", longitude: "", area: "" }).name).toMatch(/required/i);
    expect(validateSite({ name: "Plot", siteType: "orchard", latitude: "-1.9", longitude: "", area: "" }).coordinates).toMatch(/both/i);
    expect(validateSite({ name: "Plot", siteType: "orchard", latitude: "95", longitude: "30", area: "" }).coordinates).toMatch(/Latitude/i);
  });

  it("rejects an invalid batch quantity before save", () => {
    expect(validateQuantity("0")).toMatch(/Quantity/);
    expect(validateQuantity("12.5")).toMatch(/Quantity/);
    const errors = validatePlanting({
      siteId: "site",
      speciesId: "species",
      category: "fruit",
      plantingDate: "2026-01-01",
      latitude: "",
      longitude: "",
      quantity: "0",
    });
    expect(errors.quantity).toMatch(/Quantity/);
  });
});

describe("site form", () => {
  it("shows a name error and does not submit an empty form", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<SiteForm organizations={[]} submitLabel="Save site" onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: "Save site" }));
    expect(screen.getByText("Name is required.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
