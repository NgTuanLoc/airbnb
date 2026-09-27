"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, TextInput } from "@/components/design-system";
import { register } from "@/lib/api-client/auth";
import { registerSchema } from "@/lib/auth/schemas";
import { useSessionState } from "./session-provider";

type RegisterField = "name" | "email" | "password" | "confirmPassword";
type FieldErrors = Partial<Record<RegisterField, string>>;

export function RegisterForm({ next = "/" }: { next?: string }) {
  const router = useRouter();
  const session = useSessionState();
  const [values, setValues] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update(field: RegisterField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = registerSchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as RegisterField;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      await register(parsed.data);
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
      <TextInput label="Name" value={values.name} onChange={(e) => update("name", e.target.value)} error={errors.name} />
      <TextInput label="Email" type="email" value={values.email} onChange={(e) => update("email", e.target.value)} error={errors.email} />
      <TextInput label="Password" type="password" value={values.password} onChange={(e) => update("password", e.target.value)} error={errors.password} />
      <TextInput label="Confirm password" type="password" value={values.confirmPassword} onChange={(e) => update("confirmPassword", e.target.value)} error={errors.confirmPassword} />
      {formError && (
        <p role="alert" className="text-body-sm text-error">
          {formError}
        </p>
      )}
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Creating account…" : "Sign up"}
      </Button>
      <p className="text-body-sm text-muted">
        Already have an account?{" "}
        <Link href={next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`} className="text-ink underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
