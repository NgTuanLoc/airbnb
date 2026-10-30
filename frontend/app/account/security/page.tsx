import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Footer, TopNav } from "@/components/design-system";
import { AuthNotice } from "@/components/features/auth/auth-notice";
import { ConnectedAccounts } from "@/components/features/auth/connected-accounts";
import { clientIpFromHeader } from "@/lib/auth/client-ip";
import { getAuthGateway } from "@/lib/auth/gateway";
import { getSessionToken, requireSession } from "@/lib/auth/get-session";
import { loginPath } from "@/lib/auth/next-path";
import { oauthErrorMessage, providerLabel } from "@/lib/auth/oauth-errors";
import { ACCOUNT_SECURITY_PATH } from "@/lib/auth/oauth-flow";

export const metadata: Metadata = { title: "Login & security · Airbnb" };

type Params = { connected?: string; error?: string; provider?: string };

/** The sign-in methods on the account: its email, whether it has a password, and Google / GitHub / SSO (OAuth spec section 2). */
export default async function SecurityPage({ searchParams }: Readonly<{ searchParams: Promise<Params> }>) {
  const user = await requireSession(ACCOUNT_SECURITY_PATH);
  const token = await getSessionToken();
  const info = token
    ? await getAuthGateway().connections(token, { clientIp: clientIpFromHeader((await headers()).get("x-forwarded-for")) })
    : null;
  if (!info) redirect(loginPath(ACCOUNT_SECURITY_PATH));

  const { connected, error, provider } = await searchParams;
  const errorMessage = oauthErrorMessage(error, provider, "link");
  const connectedName = connected ? info.connections.find((c) => c.provider === connected)?.name ?? providerLabel(connected) : null;

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav active="homes" />
      <main id="main" className="mx-auto flex w-full max-w-editorial flex-1 flex-col gap-8 px-6 md:px-10 xl:px-20 py-8">
        <h1 className="text-display-md text-ink">Login &amp; security</h1>
        {errorMessage && <AuthNotice tone="error">{errorMessage}</AuthNotice>}
        {connectedName && <AuthNotice tone="success">{connectedName} is now connected.</AuthNotice>}
        <section aria-labelledby="login-heading" className="flex flex-col gap-4">
          <h2 id="login-heading" className="text-title-md text-ink">Login</h2>
          <dl className="flex flex-col divide-y divide-hairline rounded-md border border-hairline">
            <div className="flex flex-col gap-1 p-4">
              <dt className="text-title-sm text-ink">Email</dt>
              <dd className="text-body-sm text-muted">{user.email}</dd>
            </div>
            <div className="flex flex-col gap-1 p-4">
              <dt className="text-title-sm text-ink">Password</dt>
              <dd className="text-body-sm text-muted">
                {info.hasPassword ? "Set" : "Not set: you log in with a connected account below."}
              </dd>
            </div>
          </dl>
        </section>
        <section aria-labelledby="connected-heading" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="connected-heading" className="text-title-md text-ink">Connected accounts</h2>
            <p className="text-body-sm text-muted">Log in with any of these instead of a password.</p>
          </div>
          {info.connections.length > 0 ? (
            <ConnectedAccounts connections={info.connections} hasPassword={info.hasPassword} />
          ) : (
            <p className="text-body-sm text-muted">No sign-in providers are available right now.</p>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}
