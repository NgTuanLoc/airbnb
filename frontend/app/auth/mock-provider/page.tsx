import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AuthCard } from "@/components/design-system";
import { MockProviderForm } from "@/components/features/auth/mock-provider-form";
import { mockProviderName } from "@/lib/auth/mock-external";
import { isMockCallback } from "@/lib/auth/mock-provider";
import { dataSource } from "@/lib/data-source";

export const metadata: Metadata = { title: "Demo sign-in · Airbnb" };

type Params = { provider?: string; state?: string; redirect_uri?: string; login_hint?: string; error?: string };

/** Mock mode's stand-in for Google's, GitHub's or Acme's sign-in page (OAuth spec section 2). Gone in api mode. */
export default async function MockProviderPage({ searchParams }: Readonly<{ searchParams: Promise<Params> }>) {
  if (dataSource().kind !== "mock") notFound();
  const { provider = "", state, redirect_uri: redirectUri, login_hint: loginHint, error } = await searchParams;
  const name = mockProviderName(provider);
  if (!name || !state || !isMockCallback(redirectUri, provider)) notFound();

  const cancel = `${redirectUri}?${new URLSearchParams({ error: "access_denied", state })}`;
  return (
    <AuthCard title={`Sign in with ${name}`} subtitle={`Demo sign-in: no real ${name} account is used and nothing leaves this app.`}>
      <MockProviderForm
        provider={provider}
        state={state}
        redirectUri={redirectUri}
        loginHint={loginHint}
        cancelHref={cancel}
        error={error === "invalid_email" ? "Enter a valid email address" : undefined}
      />
    </AuthCard>
  );
}
