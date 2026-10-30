"use client";

import { Button, TextInput, buttonClassName } from "@/components/design-system";
import { cn } from "@/lib/utils";

interface MockProviderFormProps {
  provider: string;
  state: string;
  redirectUri: string;
  loginHint?: string;
  cancelHref: string;
  error?: string;
}

/** The demo provider's form: a plain GET, so it works before hydration and the authorize route does the redirect. */
export function MockProviderForm({ provider, state, redirectUri, loginHint, cancelHref, error }: Readonly<MockProviderFormProps>) {
  return (
    <form method="get" action="/auth/mock-provider/authorize" className="flex flex-col gap-4">
      <input type="hidden" name="provider" value={provider} />
      <input type="hidden" name="state" value={state} />
      <input type="hidden" name="redirect_uri" value={redirectUri} />
      <TextInput label="Email" name="email" type="email" autoComplete="email" defaultValue={loginHint} error={error} required />
      <TextInput label="Name (optional)" name="name" autoComplete="name" maxLength={60} />
      <Button type="submit" className="w-full">Continue</Button>
      <a href={cancelHref} className={cn(buttonClassName("secondary"), "w-full")}>Cancel</a>
    </form>
  );
}
