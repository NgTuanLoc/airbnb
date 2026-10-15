import type { Metadata } from "next";
import { AuthCard } from "@/components/design-system";
import { AuthSwitch } from "@/components/features/auth/auth-notice";
import { RegisterForm } from "@/components/features/auth/register-form";
import { SocialButtons } from "@/components/features/auth/social-buttons";
import { pathWithNext, safeNextPath } from "@/lib/auth/next-path";
import { signInOptions } from "@/lib/auth/sign-in-options";

export const metadata: Metadata = { title: "Sign up · Airbnb" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = safeNextPath(next);
  const options = await signInOptions();
  return (
    <AuthCard title="Create your account" subtitle="Sign up to get started">
      <div className="flex flex-col gap-6">
        <RegisterForm next={safeNext} />
        <SocialButtons providers={options.social} sso={options.sso} next={safeNext} />
        <AuthSwitch prompt="Already have an account?" label="Log in" href={pathWithNext("/login", safeNext)} />
      </div>
    </AuthCard>
  );
}
