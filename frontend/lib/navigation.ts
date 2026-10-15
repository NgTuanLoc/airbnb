/** A full-page navigation, e.g. to an identity provider; its own module so component tests can mock it (jsdom can't navigate). */
export function navigateTo(url: string): void {
  window.location.assign(url);
}
