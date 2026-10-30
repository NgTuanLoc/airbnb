"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/design-system";
import { disconnectProvider, startOAuth } from "@/lib/api-client/auth";
import { navigateTo } from "@/lib/navigation";
import type { Connection } from "@/lib/auth/gateway";
import { ProviderIcon } from "./provider-icon";

interface ConnectedAccountsProps {
  connections: Connection[];
  hasPassword: boolean;
}

/** Login & security's provider rows: Connect sends the browser to the provider, Disconnect refreshes the page. */
export function ConnectedAccounts({ connections, hasPassword }: Readonly<ConnectedAccountsProps>) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const connectedCount = connections.filter((c) => c.email).length;

  async function act(provider: string, action: () => Promise<void>) {
    setError(null);
    setPending(provider);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong");
      setPending(null);
    }
  }

  const connect = (provider: string) =>
    act(provider, async () => {
      const { redirectUrl } = await startOAuth({ provider, link: true });
      navigateTo(redirectUrl);
    });

  const disconnect = (provider: string) =>
    act(provider, async () => {
      await disconnectProvider(provider);
      setPending(null);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y divide-hairline rounded-md border border-hairline">
        {connections.map((connection) => {
          // Without a password, the only connected provider is the only way in.
          const isLastWayIn = !hasPassword && connectedCount === 1 && Boolean(connection.email);
          return (
            <li key={connection.provider} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <ProviderIcon provider={connection.provider} />
                <div className="flex flex-col">
                  <span className="text-title-sm text-ink">{connection.kind === "sso" ? `${connection.name} (SSO)` : connection.name}</span>
                  <span className="text-body-sm text-muted">{connection.email ? `Connected as ${connection.email}` : "Not connected"}</span>
                  {isLastWayIn && <span className="text-body-sm text-muted">Connect another account before disconnecting this one.</span>}
                </div>
              </div>
              {connection.email ? (
                <Button
                  variant="secondary"
                  onClick={() => void disconnect(connection.provider)}
                  disabled={pending !== null || isLastWayIn}
                  aria-label={`Disconnect ${connection.name}`}
                >
                  Disconnect
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => void connect(connection.provider)}
                  disabled={pending !== null}
                  aria-label={`Connect ${connection.name}`}
                >
                  Connect
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="text-body-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}
