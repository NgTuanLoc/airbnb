// @vitest-environment node
import { expect, test, vi } from "vitest";
import { GET } from "./route";
import { getRepositories } from "@/lib/repositories";

test("returns the listing's booked stays without a session", async () => {
  const stays = [{ checkIn: "2030-01-01", checkOut: "2030-01-03" }];
  const spy = vi.spyOn(getRepositories().bookings, "availability").mockResolvedValueOnce(stays);

  const res = await GET(new Request("http://localhost/api/listings/l1/availability"), { params: Promise.resolve({ id: "l1" }) });

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ success: true, data: stays });
  expect(spy).toHaveBeenCalledWith("l1");
  spy.mockRestore();
});
