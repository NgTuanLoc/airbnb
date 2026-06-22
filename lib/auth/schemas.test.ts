import { describe, expect, test } from "vitest";
import { loginSchema, registerSchema } from "./schemas";

describe("loginSchema", () => {
  test("accepts a valid email and password", () => {
    const result = loginSchema.safeParse({ email: "a@b.com", password: "supersecret" });
    expect(result.success).toBe(true);
  });

  test("rejects an invalid email", () => {
    const result = loginSchema.safeParse({ email: "nope", password: "supersecret" });
    expect(result.success).toBe(false);
  });

  test("rejects a short password", () => {
    const result = loginSchema.safeParse({ email: "a@b.com", password: "short" });
    expect(result.success).toBe(false);
  });
});

describe("registerSchema", () => {
  const valid = { name: "Ada", email: "a@b.com", password: "supersecret", confirmPassword: "supersecret" };

  test("accepts matching passwords", () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  test("rejects mismatched passwords on the confirmPassword field", () => {
    const result = registerSchema.safeParse({ ...valid, confirmPassword: "different1" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("confirmPassword"))).toBe(true);
    }
  });

  test("rejects a one-character name", () => {
    expect(registerSchema.safeParse({ ...valid, name: "A" }).success).toBe(false);
  });
});
