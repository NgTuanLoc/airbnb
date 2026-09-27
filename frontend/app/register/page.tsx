import type { Metadata } from "next";
import { AuthCard } from "@/components/design-system";
import { RegisterForm } from "@/components/features/auth/register-form";
import { safeNextPath } from "@/lib/auth/next-path";

export const metadata: Metadata = { title: "Sign up · Airbnb" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthCard title="Create your account" subtitle="Sign up to get started">
      <RegisterForm next={safeNextPath(next)} />
    </AuthCard>
  );
}
