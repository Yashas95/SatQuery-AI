import dynamic from "next/dynamic";
import HeroFade from "@/components/ui/HeroFade";
import HeroOverlay from "@/components/ui/HeroOverlay";

/**
 * The WebGL scene is client-only: it touches window/WebGL on mount and
 * has no meaningful server-rendered form.
 */
const HeroScene = dynamic(() => import("@/components/scene/HeroScene"), {
  loading: () => <SceneFallback />,
});

function SceneFallback() {
  return (
    // Themed rather than hardcoded cream: in dark mode a fixed #FBF7EE
    // flashes a bright panel for as long as the WebGL chunk takes to load.
    <div className="absolute inset-0 grid place-items-center bg-[var(--background)]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400/20 border-t-cyan-400" />
        <span className="font-mono text-[10px] tracking-[0.2em] text-cyan-400/60">
          INITIALISING ORBIT
        </span>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    // Transparent so the shared sky shows through as the scene fades on
    // departure — an opaque background here would hide the very layer that
    // makes the two screens read as one place.
    <main className="relative z-10 h-full w-full overflow-hidden">
      {/* HeroFade wraps the scene, not the overlay: it has to cover the
          drei <Html> panels that the canvas portals into this subtree. */}
      <HeroFade>
        <HeroScene />
      </HeroFade>
      <HeroOverlay />
    </main>
  );
}
