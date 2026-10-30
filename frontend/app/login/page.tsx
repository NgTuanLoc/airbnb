import type { Metadata } from "next";
import { AuthCard } from "@/components/design-system";
import { AuthNotice, AuthSwitch } from "@/components/features/auth/auth-notice";
import { LoginForm } from "@/components/features/auth/login-form";
import { SocialButtons } from "@/components/features/auth/social-buttons";
import { pathWithNext, safeNextPath } from "@/lib/auth/next-path";
import { oauthErrorMessage } from "@/lib/auth/oauth-errors";
import { signInOptions } from "@/lib/auth/sign-in-options";

export const metadata: Metadata = { title: "Log in · Airbnb" };

type Params = { next?: string; error?: string; provider?: string };

export default async function LoginPage({ searchParams }: Readonly<{ searchParams: Promise<Params> }>) {
  const { next, error, provider } = await searchParams;
  const safeNext = safeNextPath(next);
  // ?error= is a code from the OAuth callback; only fixed text is ever shown for it.
  const message = oauthErrorMessage(error, provider, "login");
  const options = await signInOptions();
  return (
    <AuthCard title="Welcome back" subtitle="Log in to your account">
      <div className="flex flex-col gap-6">
        {message && <AuthNotice tone="error">{message}</AuthNotice>}
        <LoginForm next={safeNext} />
        <SocialButtons providers={options.social} sso={options.sso} next={safeNext} />
        <AuthSwitch prompt="Don't have an account?" label="Sign up" href={pathWithNext("/register", safeNext)} />
      </div>
    </AuthCard>
  );
}
