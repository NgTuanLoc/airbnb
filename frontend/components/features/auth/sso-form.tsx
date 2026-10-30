"use client";

import { useState } from "react";
import { z } from "zod";
import { Button, TextInput } from "@/components/design-system";
import { startOAuth } from "@/lib/api-client/auth";
import { navigateTo } from "@/lib/navigation";

const workEmail = z.email("Enter a valid work email");

/** Work email → the company's identity provider (OAuth spec section 2); "not set up" shows here, not on a new page. */
export function SsoForm({ next = "/" }: Readonly<{ next?: string }>) {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = workEmail.safeParse(email.trim());
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message);
      return;
    }
    setFieldError(undefined);
    setFormError(null);
    setSubmitting(true);
    try {
      const { redirectUrl } = await startOAuth({ provider: "sso", email: parsed.data, next });
      navigateTo(redirectUrl);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      <TextInput label="Work email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fieldError} />
      {formError && (
        <p role="alert" className="text-body-sm text-error">
          {formError}
        </p>
      )}
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Redirecting…" : "Continue"}
      </Button>
    </form>
  );
}
