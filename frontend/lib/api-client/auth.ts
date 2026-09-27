import { z } from "zod";
import type { LoginInput, RegisterInput } from "@/lib/auth/schemas";
import type { User } from "@/lib/types";
import { callApi } from "./request";
import { userSchema } from "./schemas";

export const SESSION_QUERY_KEY = ["session"] as const;

export function fetchSession(): Promise<User | null> {
  return callApi("/api/auth/session", userSchema.nullable());
}

export function login(input: LoginInput): Promise<User> {
  return callApi("/api/auth/login", userSchema, { method: "POST", body: JSON.stringify(input) });
}

export function register(input: RegisterInput): Promise<User> {
  return callApi("/api/auth/register", userSchema, { method: "POST", body: JSON.stringify(input) });
}

export async function logout(): Promise<void> {
  await callApi("/api/auth/logout", z.null(), { method: "POST" });
}
