import type { Metadata } from "next";
import { AuthCard } from "@/components/design-system";
import { LoginForm } from "@/components/features/auth/login-form";

export const metadata: Metadata = { title: "Log in · Airbnb" };

export default function LoginPage() {
  return (
    <AuthCard title="Welcome back" subtitle="Log in to your account">
      <LoginForm />
    </AuthCard>
  );
}
