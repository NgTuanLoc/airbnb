import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { HostCard } from "./host-card";
import type { Host } from "@/lib/types";

const host: Host = { id: "h1", name: "Maya", avatar: "/m.jpg", isSuperhost: true, responseRate: 100, joinedYear: 2016 };

describe("HostCard", () => {
  test("shows the host name, superhost badge, response rate, and contact CTA", () => {
    render(<HostCard host={host} />);
    expect(screen.getByText(/hosted by maya/i)).toBeInTheDocument();
    expect(screen.getByText(/superhost/i)).toBeInTheDocument();
    expect(screen.getByText(/100%/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /contact host/i })).toBeInTheDocument();
  });

  test("omits the superhost badge for a non-superhost", () => {
    render(<HostCard host={{ ...host, isSuperhost: false }} />);
    expect(screen.queryByText(/superhost/i)).not.toBeInTheDocument();
  });
});
