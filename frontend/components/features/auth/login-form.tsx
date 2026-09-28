"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, TextInput } from "@/components/design-system";
import { login } from "@/lib/api-client/auth";
import { loginSchema } from "@/lib/auth/schemas";
import { useSessionState } from "./session-provider";

type FieldErrors = Partial<Record<"email" | "password", string>>;

export function LoginForm({ next = "/" }: { next?: string }) {
  const router = useRouter();
  const session = useSessionState();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "email" || key === "password") fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      await login(parsed.data);
      await session?.refresh();
      router.push(next);
      router.refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* A submit before hydration is a native GET to this page; this keeps ?next= through it. */}
      <input type="hidden" name="next" value={next} />
      <TextInput label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
      <TextInput label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
      {formError && (
        <p role="alert" className="text-body-sm text-error">
          {formError}
        </p>
      )}
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Logging in…" : "Log in"}
      </Button>
      <p className="text-body-sm text-muted">
        Don&apos;t have an account?{" "}
        <Link href={next === "/" ? "/register" : `/register?next=${encodeURIComponent(next)}`} className="text-ink underline">
          Sign up
        </Link>
      </p>
    </form>
  );
}
