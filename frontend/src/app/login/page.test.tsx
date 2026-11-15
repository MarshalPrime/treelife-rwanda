import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "@/app/login/page";

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: null, loading: false, login: mocks.login }),
}));

afterEach(cleanup);

describe("login account source choice", () => {
  beforeEach(() => {
    mocks.login.mockReset();
    mocks.replace.mockReset();
    mocks.login.mockResolvedValue({});
  });

  it("keeps the TreeLife login form selected by default", () => {
    render(<LoginPage />);

    expect(screen.getByRole("heading", { name: "Choose how you sign in" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /TreeLife account/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /AMIS account/i })).not.toBeChecked();
  });

  it("shows the AMIS preview without calling the login API", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole("radio", { name: /AMIS account/i }));

    expect(screen.getByRole("region", { name: "Bring your farmer records with you" })).toBeInTheDocument();
    expect(screen.getByText("Bring your farmer records with you")).toBeInTheDocument();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(mocks.login).not.toHaveBeenCalled();
  });

  it("returns from the AMIS preview to the normal login form", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole("radio", { name: /AMIS account/i }));
    await user.click(screen.getByRole("button", { name: "Use a TreeLife account" }));

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /TreeLife account/i })).toBeChecked();
  });

  it("submits the existing TreeLife credentials unchanged", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText("Email"), "agent@example.com");
    await user.type(screen.getByLabelText("Password"), "secret-pass");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(mocks.login).toHaveBeenCalledWith("agent@example.com", "secret-pass");
    expect(mocks.replace).toHaveBeenCalledWith("/dashboard");
  });
});
