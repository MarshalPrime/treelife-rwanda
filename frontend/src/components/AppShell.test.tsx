import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell, linksForRole, pathAllowed } from "@/components/AppShell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ children, onClick, ...props }: ComponentProps<"a">) => <a {...props} onClick={(event) => { event.preventDefault(); onClick?.(event); }}>{children}</a>,
}));
vi.mock("@/components/farmer-account", () => ({ FarmerAccount: () => <button type="button">Your account</button> }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { id: "officer", full_name: "Field Officer", role: "field_officer" }, logout: vi.fn() }),
}));
vi.mock("@/lib/outbox", () => ({ readOutbox: () => [], removeOutbox: vi.fn() }));

afterEach(cleanup);

describe("workspace navigation", () => {
  it("keeps viewer and administrator route permissions", () => {
    expect(linksForRole("viewer").map(([path]) => path)).toEqual(["/dashboard", "/map", "/trees"]);
    expect(pathAllowed("viewer", "/trees/new")).toBe(false);
    expect(pathAllowed("admin", "/sites/new")).toBe(false);
    expect(pathAllowed("field_officer", "/sites/new")).toBe(true);
  });

  it("groups links and provides an accessible main landmark", () => {
    render(<AppShell><h1>Planting overview</h1></AppShell>);
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
    expect(screen.getByText("Planting & people")).toBeInTheDocument();
    expect(screen.getByText("Care & production")).toBeInTheDocument();
  });

  it("opens the navigation drawer, traps focus, and restores focus on Escape", async () => {
    const user = userEvent.setup();
    render(<AppShell><h1>Planting overview</h1></AppShell>);
    const toggle = screen.getByRole("button", { name: /menu/i });
    await user.click(toggle);
    const drawer = screen.getByRole("dialog", { name: "Navigation" });
    const close = within(drawer).getByRole("button", { name: "Close navigation" });
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(within(drawer).getByRole("button", { name: "Log out" })).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("closes the drawer after choosing a destination", async () => {
    const user = userEvent.setup();
    render(<AppShell><h1>Planting overview</h1></AppShell>);
    await user.click(screen.getByRole("button", { name: /menu/i }));
    const drawer = screen.getByRole("dialog", { name: "Navigation" });
    await user.click(within(drawer).getByRole("link", { name: "Trees" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
