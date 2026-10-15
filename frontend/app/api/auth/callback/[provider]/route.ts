import { withErrorEnvelope } from "@/lib/api/request";
import { clientIp } from "@/lib/auth/client-ip";
import { getAuthGateway } from "@/lib/auth/gateway";
import { safeNextPath } from "@/lib/auth/next-path";
import { oauthErrorCode, type OAuthErrorCode } from "@/lib/auth/oauth-errors";
import { ACCOUNT_SECURITY_PATH, clearedFlowCookie, flowFromRequest, type OAuthFlow } from "@/lib/auth/oauth-flow";
import { revokePreviousSession, sessionCookie } from "@/lib/auth/session";

/** A 303 to a same-site path, always clearing the flow cookie: a flow is over once its callback arrives. */
function redirect(location: string, sessionToken?: string): Response {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  headers.append("Set-Cookie", clearedFlowCookie());
  if (sessionToken) headers.append("Set-Cookie", sessionCookie(sessionToken));
  return new Response(null, { status: 303, headers });
}

/** Where a failed flow lands: the log-in page, or Login & security for a connect flow, with a code and never a message. */
function failure(flow: OAuthFlow | null, code: OAuthErrorCode, provider: string): Response {
  const query = new URLSearchParams({ error: code, provider });
  if (flow?.intent === "link") return redirect(`${ACCOUNT_SECURITY_PATH}?${query}`);
  const next = safeNextPath(flow?.next);
  if (next !== "/") query.set("next", next);
  return redirect(`/login?${query}`);
}

/**
 * Where Google, GitHub and SSO providers send the browser back (OAuth spec section 2). The backend checks the flow
 * in the cookie against this provider and the state, redeems the code, and answers with a session or a connection.
 */
export const GET = withErrorEnvelope(async (request: Request, { params }: { params: Promise<{ provider: string }> }) => {
  const { provider } = await params;
  const url = new URL(request.url);
  const flow = flowFromRequest(request);
  if (!flow) return failure(null, "expired", provider);
  if (url.searchParams.has("error")) return failure(flow, "cancelled", provider);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return failure(flow, "failed", provider);

  let result;
  try {
    result = await getAuthGateway().completeExternal(
      { provider, flowId: flow.id, state, code, iss: url.searchParams.get("iss") ?? undefined },
      { clientIp: clientIp(request) },
    );
  } catch (error) {
    console.error("Completing an external sign-in failed", error);
    return failure(flow, "failed", provider);
  }
  if (!result.ok) return failure(flow, oauthErrorCode(result.code), provider);
  if ("linked" in result) return redirect(`${ACCOUNT_SECURITY_PATH}?${new URLSearchParams({ connected: result.linked.provider })}`);

  await revokePreviousSession(request, result.session.token);
  return redirect(safeNextPath(flow.next), result.session.token);
});
