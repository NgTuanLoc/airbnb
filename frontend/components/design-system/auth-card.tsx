import Link from "next/link";

export interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export function AuthCard({ title, subtitle, children }: AuthCardProps) {
  return (
    <main id="main" className="flex min-h-screen flex-col items-center justify-center bg-surface-soft px-6 py-12">
      <div
        data-testid="auth-card"
        className="w-full max-w-md rounded-md border border-hairline bg-canvas p-8 shadow-airbnb"
      >
        <Link href="/" className="mb-6 block text-display-sm font-bold text-rausch" aria-label="Airbnb home">
          airbnb
        </Link>
        <h1 className="text-display-sm text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-body-md text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
