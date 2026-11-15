import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RegisterPage from "@/app/register/page";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  login: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));

vi.mock("@/lib/api", () => ({
  api: mocks.api,
  ApiError: class ApiError extends Error {},
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: null, loading: false, login: mocks.login }),
}));

afterEach(cleanup);

describe("registration account source choice", () => {
  beforeEach(() => {
    mocks.api.mockReset();
    mocks.login.mockReset();
    mocks.replace.mockReset();
  });

  it("shows the compact TreeLife registration form by default", () => {
    render(<RegisterPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Create an account" })).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /TreeLife account/i })).toBeChecked();
  });

  it("links account creation to the AMIS preview without submitting data", async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);

    await user.click(screen.getByRole("radio", { name: /AMIS account/i }));

    expect(screen.getByRole("region", { name: "Bring your farmer records with you" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Full name")).not.toBeInTheDocument();
    expect(mocks.api).not.toHaveBeenCalled();
    expect(mocks.login).not.toHaveBeenCalled();
  });

  it("returns from the AMIS preview to normal account creation", async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);

    await user.click(screen.getByRole("radio", { name: /AMIS account/i }));
    await user.click(screen.getByRole("button", { name: "Create a TreeLife account instead" }));

    expect(screen.getByLabelText("Full name")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /TreeLife account/i })).toBeChecked();
  });
});
