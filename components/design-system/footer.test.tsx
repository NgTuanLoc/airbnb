import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { Footer } from "./footer";

describe("Footer", () => {
  test("renders the three column headings", () => {
    render(<Footer />);
    expect(screen.getByText("Support")).toBeInTheDocument();
    expect(screen.getByText("Hosting")).toBeInTheDocument();
    expect(screen.getByText("Airbnb")).toBeInTheDocument();
  });

  test("renders the legal band with copyright and language", () => {
    render(<Footer />);
    expect(screen.getByText(/© 2026 Airbnb, Inc\./)).toBeInTheDocument();
    expect(screen.getByText("English (US)")).toBeInTheDocument();
  });

  test("renders social links with accessible labels", () => {
    render(<Footer />);
    expect(screen.getByLabelText("Facebook")).toBeInTheDocument();
    expect(screen.getByLabelText("Instagram")).toBeInTheDocument();
    expect(screen.getByLabelText("Twitter")).toBeInTheDocument();
  });
});
