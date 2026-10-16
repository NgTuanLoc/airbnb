/** The only place the demo provider sends a browser back to: this app's callback route for that provider. */
export function isMockCallback(redirectUri: string | null | undefined, provider: string): redirectUri is string {
  return redirectUri === `/api/auth/callback/${provider}`;
}
