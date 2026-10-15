import type { Metadata } from "next";
import { AuthCard } from "@/components/design-system";
import { AuthSwitch } from "@/components/features/auth/auth-notice";
import { SsoForm } from "@/components/features/auth/sso-form";
import { pathWithNext, safeNextPath } from "@/lib/auth/next-path";

export const metadata: Metadata = { title: "Log in with SSO · Airbnb" };

export default async function SsoPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = safeNextPath(next);
  return (
    <AuthCard title="Log in with SSO" subtitle="Use your work email to continue with your company's single sign-on.">
      <div className="flex flex-col gap-6">
        <SsoForm next={safeNext} />
        <AuthSwitch label="Other ways to log in" href={pathWithNext("/login", safeNext)} />
      </div>
    </AuthCard>
  );
}
