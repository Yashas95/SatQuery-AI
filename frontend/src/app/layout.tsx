import type { Metadata } from "next";
import { Instrument_Serif } from "next/font/google";
import "./globals.css";

import SpaceBackdrop from "@/components/app/SpaceBackdrop";
import ThemeSync from "@/components/app/ThemeSync";

/**
 * The display face for the headline.
 *
 * next/font downloads and self-hosts the files at build time, so this keeps
 * the original "no font CDN at runtime" constraint — nothing is fetched from
 * a third party when the page loads, and there's no layout shift or
 * render-blocking stylesheet. A real high-contrast serif rather than
 * whatever serif the OS happens to supply.
 *
 * Upright only — nothing sets this face in italic, and loading a cut that
 * never renders is a font file downloaded for nothing.
 */
const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "SatQuery — Ask satellite imagery anything",
  description:
    "An agentic vision-language assistant for remote-sensing imagery. Natural-language queries planned, routed to specialist models, and answered with grounded visual evidence.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`h-full antialiased ${display.variable}`}>
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
