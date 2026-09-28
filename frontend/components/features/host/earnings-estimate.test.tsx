import { expect, test } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";
import { EarningsEstimate } from "./earnings-estimate";

const cities = [
  { id: "aspen", name: "Aspen", averagePrice: 250 },
  { id: "kyoto", name: "Kyoto", averagePrice: 95 },
];

test("estimates a month from the city's average price and the nights", async () => {
  render(<EarningsEstimate cities={cities} />);
  expect(screen.getByText("$1,750")).toBeInTheDocument(); // Aspen, 7 nights

  await userEvent.selectOptions(screen.getByLabelText("City"), "kyoto");
  expect(screen.getByText("$665")).toBeInTheDocument(); // 95 × 7
});
