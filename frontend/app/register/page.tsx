import type { Metadata } from "next";
import { AuthCard } from "@/components/design-system";
import { RegisterForm } from "@/components/features/auth/register-form";

export const metadata: Metadata = { title: "Sign up · Airbnb" };

export default function RegisterPage() {
  return (
    <AuthCard title="Create your account" subtitle="Sign up to get started">
      <RegisterForm />
    </AuthCard>
  );
}
