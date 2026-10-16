import Link from "next/link";
import { cn } from "@/lib/utils";

/** A page-level message on the auth pages: an alert for errors, a polite status for good news. */
export function AuthNotice({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn("rounded-sm border px-4 py-3 text-body-sm", tone === "error" ? "border-error text-error" : "border-hairline bg-surface-soft text-ink")}
    >
      {children}
    </p>
  );
}

/** "Don't have an account? Sign up": the link between the log-in and sign-up pages, keeping ?next=. */
export function AuthSwitch({ prompt, label, href }: { prompt?: string; label: string; href: string }) {
  return (
    <p className="text-body-sm text-muted">
      {prompt && <>{prompt} </>}
      <Link href={href} className="text-ink underline">
        {label}
      </Link>
    </p>
  );
}
