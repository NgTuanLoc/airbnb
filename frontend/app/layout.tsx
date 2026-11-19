import type { Metadata } from "next";
import Script from "next/script";
import { inter } from "./fonts";
import { SkipLink } from "@/components/design-system";
import { AssistantSlot } from "@/components/features/assistant/assistant-slot";
import { NotificationsProvider } from "@/components/features/notifications/notifications-provider";
import { broadcastsEnabled } from "@/lib/notifications/config";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Airbnb",
  description: "Find places to stay, things to do, and services.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Umami page views (the AppHost sets both under `aspire run`, the id once the site is added in Umami).
  const umamiUrl = process.env.UMAMI_URL;
  const umamiWebsiteId = process.env.UMAMI_WEBSITE_ID;
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-canvas text-ink antialiased">
        <SkipLink />
        <Providers>
          {/* In the layout, so the announcements stream and the conversation survive moving between pages. */}
          <NotificationsProvider enabled={broadcastsEnabled()}>
            {children}
            <AssistantSlot />
          </NotificationsProvider>
        </Providers>
        {umamiUrl && umamiWebsiteId && (
          <Script src={`${umamiUrl}/script.js`} data-website-id={umamiWebsiteId} strategy="afterInteractive" />
        )}
      </body>
    </html>
  );
}
