import Link from "next/link";
import { cn } from "@/lib/utils";

/** A page-level message on the auth pages: an alert for errors, a polite status for good news. */
export function AuthNotice({ tone, children }: Readonly<{ tone: "error" | "success"; children: React.ReactNode }>) {
  const notice = "rounded-sm border px-4 py-3 text-body-sm";
  if (tone === "error") {
    return (
      <p role="alert" className={cn(notice, "border-error text-error")}>
        {children}
      </p>
    );
  }
  return <output className={cn(notice, "block border-hairline bg-surface-soft text-ink")}>{children}</output>;
}

/** "Don't have an account? Sign up": the link between the log-in and sign-up pages, keeping ?next=. */
export function AuthSwitch({ prompt, label, href }: Readonly<{ prompt?: string; label: string; href: string }>) {
  return (
    <p className="text-body-sm text-muted">
      {prompt && <>{prompt} </>}
      <Link href={href} className="text-ink underline">
        {label}
      </Link>
    </p>
  );
}
