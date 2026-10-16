import { describe, expect, test } from "vitest";
import { oauthErrorCode, oauthErrorMessage, providerLabel } from "./oauth-errors";

describe("oauthErrorCode", () => {
  test("keeps the refusals a page explains, calls an expired flow expired, and everything else a failure", () => {
    for (const code of ["account_exists", "no_verified_email", "email_domain_not_allowed", "identity_in_use", "provider_already_connected"]) {
      expect(oauthErrorCode(code)).toBe(code);
    }
    expect(oauthErrorCode("flow_expired")).toBe("expired");
    expect(oauthErrorCode("flow_mismatch")).toBe("failed");
    expect(oauthErrorCode(undefined)).toBe("failed");
  });
});

describe("oauthErrorMessage", () => {
  test("names the provider from a fixed list, never from the URL", () => {
    expect(providerLabel("google")).toBe("Google");
    expect(providerLabel("github")).toBe("GitHub");
    expect(providerLabel("sso-acme")).toBe("single sign-on");
    expect(providerLabel("<script>")).toBe("that provider");
    expect(oauthErrorMessage("failed", "Call 555-0100 now", "login")).toBe("We couldn't sign you in with that provider. Try again.");
  });

  test("tells someone with a password account how to connect the provider", () => {
    expect(oauthErrorMessage("account_exists", "google", "login")).toBe(
      "An account with this email already exists. Log in with your password, then connect Google from Login & security.",
    );
  });

  test("words sign-in and connect failures differently", () => {
    expect(oauthErrorMessage("cancelled", "github", "login")).toBe("Signing in with GitHub was cancelled.");
    expect(oauthErrorMessage("cancelled", "github", "link")).toBe("Connecting GitHub was cancelled.");
    expect(oauthErrorMessage("failed", "github", "link")).toBe("We couldn't connect GitHub. Try again.");
  });

  test("an unknown or missing code has no message", () => {
    expect(oauthErrorMessage("you-have-been-hacked", "google", "login")).toBeNull();
    expect(oauthErrorMessage(undefined, undefined, "login")).toBeNull();
  });
});
