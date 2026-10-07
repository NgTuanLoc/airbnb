// @vitest-environment node
import { expect, test } from "vitest";
import { mockAuthGateway } from "./mock-gateway";

test("any valid login succeeds and me() reads the token back", async () => {
  const result = await mockAuthGateway.login({ email: " Ana@Example.com ", password: "whatever1" });
  if (!result.ok) throw new Error("expected ok");
  expect(result.session.user).toEqual({ id: "u-ana@example.com", name: "ana", email: "ana@example.com" });
  expect(await mockAuthGateway.me(result.session.token)).toEqual(result.session.user);
});

test("register keeps the given name", async () => {
  const result = await mockAuthGateway.register({ name: "Ana Lima", email: "ana@example.com", password: "whatever1" });
  if (!result.ok) throw new Error("expected ok");
  expect(result.session.user.name).toBe("Ana Lima");
});

test("an unreadable token is logged out", async () => {
  expect(await mockAuthGateway.me("not-base64-json")).toBeNull();
});
