import type { Metadata } from "next";
import { inter } from "./fonts";
import { SkipLink } from "@/components/design-system";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Airbnb",
  description: "Find places to stay, things to do, and services.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-canvas text-ink antialiased">
        <SkipLink />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
