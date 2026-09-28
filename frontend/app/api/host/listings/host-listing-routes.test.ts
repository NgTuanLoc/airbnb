// @vitest-environment node
import { describe, expect, test } from "vitest";
import { POST } from "./route";
import { PUT } from "./[id]/route";
import { PATCH } from "./[id]/status/route";
import { jsonRequest, sessionCookieHeader } from "@/lib/auth/test-helpers";
import { validInput } from "@/lib/host/test-fixtures";
import { getRepositories } from "@/lib/repositories";

const url = "http://localhost/api/host/listings";
const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function create(cookie: string, body: object = validInput) {
  const res = await POST(jsonRequest(url, "POST", body, cookie));
  return { res, body: await res.json() };
}

describe("host listing API", () => {
  test("every endpoint needs a session", async () => {
    expect((await POST(jsonRequest(url, "POST", validInput))).status).toBe(401);
    expect((await PUT(jsonRequest(`${url}/hl-x`, "PUT", validInput), params("hl-x"))).status).toBe(401);
    const res = await PATCH(jsonRequest(`${url}/hl-x/status`, "PATCH", { status: "unlisted" }), params("hl-x"));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Log in to continue");
  });

  test("creates a listed listing and the host profile", async () => {
    const email = `host-${crypto.randomUUID()}@example.com`;
    const { res, body } = await create(sessionCookieHeader(email));

    expect(res.status).toBe(201);
    expect(body.data).toMatchObject({ title: "Sunny cabin by the lake", status: "listed", hostId: `u-${email}` });
    expect((await getRepositories().hosts.findById(`u-${email}`))?.name).toBe(email.split("@")[0]);
    expect((await getRepositories().listings.findById(body.data.id))?.id).toBe(body.data.id);
  });

  test("rejects photos outside the gallery and says why", async () => {
    const { res, body } = await create(sessionCookieHeader(), { ...validInput, photos: ["https://evil.example.com/x.jpg"] });
    expect(res.status).toBe(400);
    expect(body.error).toBe("Pick 1 to 5 photos");
  });

  test("the owner can update and unlist; the listing keeps its id", async () => {
    const cookie = sessionCookieHeader();
    const { body } = await create(cookie);
    const id = body.data.id;

    const updated = await PUT(jsonRequest(`${url}/${id}`, "PUT", { ...validInput, title: "Renamed cabin" }, cookie), params(id));
    expect(updated.status).toBe(200);
    expect((await updated.json()).data.title).toBe("Renamed cabin");

    const unlisted = await PATCH(jsonRequest(`${url}/${id}/status`, "PATCH", { status: "unlisted" }, cookie), params(id));
    expect((await unlisted.json()).data.status).toBe("unlisted");
  });

  test("another host's listing is 404 for update and status", async () => {
    const { body } = await create(sessionCookieHeader());
    const id = body.data.id;
    const stranger = sessionCookieHeader();

    const put = await PUT(jsonRequest(`${url}/${id}`, "PUT", validInput, stranger), params(id));
    const patch = await PATCH(jsonRequest(`${url}/${id}/status`, "PATCH", { status: "unlisted" }, stranger), params(id));

    expect(put.status).toBe(404);
    expect((await put.json()).error).toBe("Listing not found");
    expect(patch.status).toBe(404);
    expect((await getRepositories().hostListings.findById(id))?.status).toBe("listed");
  });

  test("an invalid status body is 400", async () => {
    const cookie = sessionCookieHeader();
    const { body } = await create(cookie);
    const res = await PATCH(jsonRequest(`${url}/${body.data.id}/status`, "PATCH", { status: "deleted" }, cookie), params(body.data.id));
    expect(res.status).toBe(400);
  });
});
