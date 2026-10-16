/**
 * Why an OAuth flow came back without signing anyone in. Pages get a code in the URL, never a message, so a
 * crafted link can't put words on our page (OAuth spec section 2, "Routes").
 */
export type OAuthErrorCode =
  | "cancelled"
  | "expired"
  | "failed"
  | "account_exists"
  | "no_verified_email"
  | "email_domain_not_allowed"
  | "identity_in_use"
  | "provider_already_connected";

const SPECIFIC = new Set<string>([
  "account_exists",
  "no_verified_email",
  "email_domain_not_allowed",
  "identity_in_use",
  "provider_already_connected",
]);

/** The page's code for a backend failure code: an expired flow, one of the specific refusals, or a plain failure. */
export function oauthErrorCode(backendCode: string | undefined): OAuthErrorCode {
  if (backendCode === "flow_expired") return "expired";
  return backendCode && SPECIFIC.has(backendCode) ? (backendCode as OAuthErrorCode) : "failed";
}

/** What a provider key is called in a message; anything unexpected gets a neutral name rather than an echo. */
export function providerLabel(provider: string | undefined): string {
  if (provider === "google") return "Google";
  if (provider === "github") return "GitHub";
  if (provider?.startsWith("sso-")) return "single sign-on";
  return "that provider";
}

/** The text for an error code on the log-in page (sign-in) or Login & security (connect); null for an unknown code. */
export function oauthErrorMessage(code: string | undefined, provider: string | undefined, intent: "login" | "link"): string | null {
  const name = providerLabel(provider);
  switch (code) {
    case "cancelled":
      return intent === "link" ? `Connecting ${name} was cancelled.` : `Signing in with ${name} was cancelled.`;
    case "expired":
      return "That sign-in attempt expired. Try again.";
    case "account_exists":
      return `An account with this email already exists. Log in with your password, then connect ${name} from Login & security.`;
    case "no_verified_email":
      return `Your ${name} account doesn't have a verified email address.`;
    case "email_domain_not_allowed":
      return "That account's email isn't on a domain your company's single sign-on covers.";
    case "identity_in_use":
      return `That ${name} account is already connected to another account.`;
    case "provider_already_connected":
      return `You've already connected a different ${name} account. Disconnect it first.`;
    case "failed":
      return intent === "link" ? `We couldn't connect ${name}. Try again.` : `We couldn't sign you in with ${name}. Try again.`;
    default:
      return null;
  }
}
