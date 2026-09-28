import type { Metadata } from "next";
import { AuthCard } from "@/components/design-system";
import { LoginForm } from "@/components/features/auth/login-form";
import { safeNextPath } from "@/lib/auth/next-path";

export const metadata: Metadata = { title: "Log in · Airbnb" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthCard title="Welcome back" subtitle="Log in to your account">
      <LoginForm next={safeNextPath(next)} />
    </AuthCard>
  );
}
