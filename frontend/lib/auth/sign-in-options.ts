import "server-only";
import { getAuthGateway, type ProvidersInfo } from "./gateway";

/** The log-in page's provider buttons; a backend outage hides them rather than breaking the page. */
export async function signInOptions(): Promise<ProvidersInfo> {
  try {
    return await getAuthGateway().providers();
  } catch (error) {
    console.error("Reading the sign-in providers failed", error);
    return { social: [], sso: false };
  }
}
