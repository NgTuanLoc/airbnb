import { describe, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";
import { GuestPanel } from "./guest-panel";

describe("GuestPanel", () => {
  test("renders the guest stepper rows", () => {
    render(<GuestPanel value={{ adults: 0, children: 0 }} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Increase adults" })).toBeInTheDocument();
  });

  test("increasing adults fires onChange with the next counts", async () => {
    const onChange = vi.fn();
    render(<GuestPanel value={{ adults: 0, children: 0 }} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Increase adults" }));
    expect(onChange).toHaveBeenCalledWith({ adults: 1, children: 0 });
  });

  test("the wrapper fits a phone-width overlay instead of a bare fixed width", () => {
    render(<GuestPanel value={{ adults: 0, children: 0 }} onChange={() => {}} />);
    const wrapper = screen.getByRole("button", { name: "Increase adults" }).closest("div.w-full");
    expect(wrapper?.className).toContain("w-full");
    expect(wrapper?.className).toContain("max-w-[320px]");
    expect(wrapper?.className).not.toMatch(/(?<!max-)w-\[320px\]/);
  });
});
