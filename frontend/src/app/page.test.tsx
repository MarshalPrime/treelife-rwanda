import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HomePage from "./page";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));

vi.mock("next/dynamic", () => ({
  default: () => function MockMap() {
    return <div data-testid="mock-example-map" />;
  },
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));

function renderHome() {
  return render(<HomePage />);
}

describe("HomePage", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders LandingHeader with mobile menu toggle and decluttered Hero", () => {
    renderHome();

    expect(screen.getByRole("link", { name: "TreeLife Rwanda" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Follow a tree from nursery to harvest/i })).toBeInTheDocument();
    expect(screen.getByText(/One record, the whole life/i)).toBeInTheDocument();

    const menuButton = screen.getByRole("button", { name: /Open navigation menu/i });
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("home-mobile-drawer")).not.toBeInTheDocument();

    fireEvent.click(menuButton);
    expect(screen.getByRole("button", { name: /Close navigation menu/i })).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("home-mobile-drawer")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Close navigation menu/i }));
    expect(document.getElementById("home-mobile-drawer")).not.toBeInTheDocument();
  });

  it("switches lifecycle stages interactively in InteractiveLifecycle (#scenes)", () => {
    renderHome();

    expect(
      screen.getByRole("heading", { name: /Everything that happens to the tree stays on one record/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Nursery manager · Mobile or desktop · Lot quantity allocated to site & farmer/i),
    ).toBeInTheDocument();

    const plantingTab = screen.getByRole("tab", { name: /02 · The tree/i });
    fireEvent.click(plantingTab);
    expect(plantingTab).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByText(/Farmer or field officer · USSD \*1234\*5# \(preview\) or GPS app · Pin & species live on KPI map/i),
    ).toBeInTheDocument();

    const carbonTab = screen.getByRole("tab", { name: /04 · Carbon/i });
    fireEvent.click(carbonTab);
    expect(carbonTab).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByText(/Authorized officer · Field app · Diameter & height logged into verified CO2e stock/i),
    ).toBeInTheDocument();
  });

  it("switches device tabs and live-updates the KPI dashboard when simulating +50 trees", () => {
    renderHome();

    expect(screen.getByText(/USSD \*1234\*5# · Preview/i)).toBeInTheDocument();
    expect(screen.getByText(/TreeLife \*1234\*5# · Demo/i)).toBeInTheDocument();
    expect(screen.getByText(/Preview · Coming soon/i)).toBeInTheDocument();
    expect(screen.getByText("14,820")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /1\. Register planted tree/i }));
    expect(screen.getByText(/Saved to record #TL-4082/i)).toBeInTheDocument();

    const keypad = within(screen.getByRole("group", { name: "USSD keypad" }));
    fireEvent.click(keypad.getByRole("button", { name: "2" }));
    expect(screen.getByText(/Status updated: Healthy/i)).toBeInTheDocument();
    fireEvent.click(keypad.getByRole("button", { name: "0" }));
    expect(screen.getByText(/TreeLife \*1234\*5# · Demo/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Log \+50 trees/i }));
    expect(screen.getByRole("status")).toHaveTextContent(/\+50 trees synced to the KPI dashboard \(\+50\)/i);
    expect(screen.getByText(/Live sync received/i)).toBeInTheDocument();
    expect(screen.getByText("14,870")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Oct: 2500 planted/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Smartphone · Field App/i }));
    expect(screen.getByText(/Outbox queue: 2 saved locally/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Log \+50 trees/i }));
    expect(screen.getByRole("status")).toHaveTextContent(/\+50 trees synced to the KPI dashboard \(\+100\)/i);
    expect(screen.getAllByText("14,920").length).toBeGreaterThanOrEqual(2);

    fireEvent.click(screen.getByRole("tab", { name: /Desktop · Command Center/i }));
    expect(screen.getByText(/TreeLife Command Center/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Huye" }));
    expect(screen.getByText("5,510")).toBeInTheDocument();
    expect(screen.getAllByText("93.2%").length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole("button", { name: /Jul: 840 planted/i }));
    expect(screen.getByText(/840 planted · 92% survival · 510 kg harvest/i)).toBeInTheDocument();
  });

  it("filters features across 3 category tabs in InteractiveFeaturesHub", () => {
    renderHome();

    expect(screen.getByRole("heading", { name: /What is in the platform/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Field Capture/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /^Nursery$/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Monitoring & Maps/i }));
    expect(screen.getByRole("tab", { name: /Tree inventory/i })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /^Nursery$/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Care in the field/i }));
    expect(
      screen.getByText(/Measure height, and record pruning, watering, mulching, pest control, or staking/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Governance & Rewards/i }));
    expect(screen.getByRole("tab", { name: /Carbon monitoring/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Accounts and audit/i })).toBeInTheDocument();

    expect(screen.getByText("Advisory AI")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Officer" }));
    expect(screen.getByText(/Summarize farms needing follow-up in Nyarugenge/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Batch allocation" }));
    expect(screen.getByText(/Lot #14 has 180 Avocado seedlings/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Ask Advisory AI"), {
      target: { value: "How is carbon measured?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByText(/32\.8 t CO2e is currently accepted/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open in workspace/i })).toHaveAttribute("href", "/login");
  });

  it("reveals badge milestone criteria and renders role-based CTA footer", () => {
    renderHome();

    expect(screen.getByText(/100\+ verified trees surviving past 6 months/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Silver/i }));
    expect(screen.getByText(/500\+ verified trees with 80%\+ survival rate/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Gold/i }));
    expect(screen.getByText(/2,000\+ verified trees with 85%\+ survival & carbon logs/i)).toBeInTheDocument();

    const farmerLink = screen.getByRole("link", { name: /Farmers & Cooperatives/i });
    const districtLink = screen.getByRole("link", { name: /Districts & Partners/i });
    expect(farmerLink).toHaveAttribute("href", "/register");
    expect(districtLink).toHaveAttribute("href", "/login");
    expect(
      screen.getByText(/TreeLife Rwanda · National tree registry, USSD \*1234\*5# \(preview\), & verified carbon tracking/i),
    ).toBeInTheDocument();
  });
});
