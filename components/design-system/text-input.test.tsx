import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { TextInput } from "./text-input";

describe("TextInput", () => {
  test("associates the label with the input", () => {
    render(<TextInput label="Email" name="email" />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  test("renders error text when provided", () => {
    render(<TextInput label="Email" error="Required" />);
    const err = screen.getByText("Required");
    expect(err.className).toContain("text-error");
  });

  test("input has the hairline border and sm radius", () => {
    render(<TextInput label="Email" />);
    const input = screen.getByLabelText("Email");
    expect(input.className).toContain("border-hairline");
    expect(input.className).toContain("rounded-sm");
  });
});
