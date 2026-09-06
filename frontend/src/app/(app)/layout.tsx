import type { Metadata } from "next";

import RouteFade from "@/components/app/RouteFade";
import TopNav from "@/components/app/TopNav";

export const metadata: Metadata = {
  title: {
    default: "SatQuery AI",
    template: "%s · SatQuery AI",
  },
};

/**
 * Shell for the analysis screens. A route group, so these share chrome
 * without adding a path segment — `/analyze`, not `/app/analyze`.
 *
 * The scroll container lives here rather than on <body>: the hero is a
 * fixed-viewport WebGL canvas and these are documents, and giving each its
 * own scrolling context means neither has to undo a global rule. `min-h-0`
 * is what lets the inner column actually scroll inside the flex parent.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    // No background of its own: the sky lives in the root layout, and an
    // opaque shell here would cover it. The ground colour is painted there.
    <div className="relative z-10 flex h-full flex-col text-[var(--ink-primary)]">
      <TopNav />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <RouteFade>{children}</RouteFade>
      </main>
    </div>
  );
}
