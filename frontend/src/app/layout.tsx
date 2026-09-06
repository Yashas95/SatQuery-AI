import type { Metadata } from "next";
import "./globals.css";

import SpaceBackdrop from "@/components/app/SpaceBackdrop";
import ThemeSync from "@/components/app/ThemeSync";

export const metadata: Metadata = {
  title: "SatQuery AI — Ask satellite imagery anything",
  description:
    "An agentic vision-language assistant for remote-sensing imagery. Natural-language queries planned, routed to specialist models, and answered with grounded visual evidence.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full">
        {/* Both live in the root layout so they persist across navigation:
            the theme must be applied before any route paints, and the sky
            has to be the same DOM node on every screen or it visibly cuts
            when you move between them. */}
        <ThemeSync />
        <SpaceBackdrop />
        {children}
      </body>
    </html>
  );
}
