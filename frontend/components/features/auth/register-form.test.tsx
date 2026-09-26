import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, userEvent, waitFor } from "@/lib/test-utils";
import { RegisterForm } from "./register-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => push.mockReset());

describe("RegisterForm", () => {
  test("shows an error when passwords do not match", async () => {
    render(<RegisterForm />);
    await userEvent.type(screen.getByLabelText("Name"), "Ada");
    await userEvent.type(screen.getByLabelText("Email"), "a@b.com");
    await userEvent.type(screen.getByLabelText("Password"), "supersecret");
    await userEvent.type(screen.getByLabelText("Confirm password"), "different1");
    await userEvent.click(screen.getByRole("button", { name: "Sign up" }));
    expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  test("navigates home on valid submit", async () => {
    render(<RegisterForm />);
    await userEvent.type(screen.getByLabelText("Name"), "Ada");
    await userEvent.type(screen.getByLabelText("Email"), "a@b.com");
    await userEvent.type(screen.getByLabelText("Password"), "supersecret");
    await userEvent.type(screen.getByLabelText("Confirm password"), "supersecret");
    await userEvent.click(screen.getByRole("button", { name: "Sign up" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
  });
});
