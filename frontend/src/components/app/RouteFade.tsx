"use client";

/**
 * Replays the arrival animation on every route change inside the workspace.
 *
 * The app layout persists across `/analyze → /compare` — that's the whole
 * point of a layout — so a CSS animation declared on it runs once, on first
 * mount, and never again. Keying this wrapper on the pathname remounts it
 * per route, which restarts the animation.
 *
 * The remount is scoped deliberately: it wraps the page content only, so
 * the masthead and the sky are untouched. Each analysis screen owns its own
 * state anyway (a different page's asset selection is not worth preserving),
 * so nothing meaningful is thrown away by the remount.
 */

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export default function RouteFade({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div key={pathname} className="sq-arrive mx-auto max-w-[1400px] px-6 py-8">
      {children}
    </div>
  );
}
