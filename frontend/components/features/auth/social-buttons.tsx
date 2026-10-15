"use client";

import { useState } from "react";
import Link from "next/link";
import { buttonClassName } from "@/components/design-system";
import { startOAuth } from "@/lib/api-client/auth";
import { navigateTo } from "@/lib/navigation";
import { pathWithNext } from "@/lib/auth/next-path";
import { cn } from "@/lib/utils";
import { ProviderIcon } from "./provider-icon";

interface SocialButtonsProps {
  providers: { id: string; name: string }[];
  sso: boolean;
  next?: string;
}

// Airbnb's outlined "Continue with …" buttons: the mark pinned left, the label centred.
const optionClass = cn(buttonClassName("secondary"), "relative w-full disabled:opacity-60");

/** "or", then Continue with Google / GitHub / SSO; nothing at all when no provider is on. */
export function SocialButtons({ providers, sso, next = "/" }: SocialButtonsProps) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(provider: string) {
    setError(null);
    setPending(provider);
    try {
      const { redirectUrl } = await startOAuth({ provider, next });
      navigateTo(redirectUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong");
      setPending(null);
    }
  }

  if (providers.length === 0 && !sso) return null;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4" aria-hidden>
        <span className="h-px flex-1 bg-hairline" />
        <span className="text-caption-sm text-muted">or</span>
        <span className="h-px flex-1 bg-hairline" />
      </div>
      {providers.map((provider) => (
        <button
          key={provider.id}
          type="button"
          onClick={() => void start(provider.id)}
          disabled={pending !== null}
          aria-busy={pending === provider.id}
          className={optionClass}
        >
          <ProviderIcon provider={provider.id} className="absolute left-6" />
          Continue with {provider.name}
        </button>
      ))}
      {sso && (
        <Link href={pathWithNext("/login/sso", next)} className={optionClass}>
          <ProviderIcon provider="sso" className="absolute left-6" />
          Continue with SSO
        </Link>
      )}
      {error && (
        <p role="alert" className="text-body-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}
