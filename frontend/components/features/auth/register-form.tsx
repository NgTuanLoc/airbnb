"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, TextInput } from "@/components/design-system";
import { registerSchema } from "@/lib/auth/schemas";

type RegisterField = "name" | "email" | "password" | "confirmPassword";
type FieldErrors = Partial<Record<RegisterField, string>>;

export function RegisterForm() {
  const router = useRouter();
  const [values, setValues] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  function update(field: RegisterField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = registerSchema.safeParse(values);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as RegisterField;
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 400));
      router.push("/");
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
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Creating account…" : "Sign up"}
      </Button>
      <p className="text-body-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-ink underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
