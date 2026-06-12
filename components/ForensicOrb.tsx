"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

// 3D scene is client-only; never SSR'd (WebGL needs a browser).
const OrbScene = dynamic(() => import("@/components/three/OrbScene"), {
  ssr: false,
  loading: () => <CssOrb />,
});

function CssOrb({ height = 360 }: { height?: number }) {
  return (
    <div className="grid w-full place-items-center" style={{ height }} aria-hidden="true">
      <div className="xt-orb-fallback xt-animate-spin-slow h-56 w-56" />
    </div>
  );
}

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")),
    );
  } catch {
    return false;
  }
}

/**
 * Renders the 3D forensic orb when WebGL is available and the user has not
 * requested reduced motion; otherwise renders an animated CSS fallback. The app
 * is fully usable either way.
 */
export function ForensicOrb({ height = 360 }: { height?: number }) {
  const [mode, setMode] = useState<"loading" | "three" | "css">("loading");

  useEffect(() => {
    // Defer the capability check into a rAF callback so setState is not called
    // synchronously in the effect body (satisfies react-hooks/set-state-in-effect)
    // and avoids any hydration mismatch (server always renders the CSS fallback).
    const id = requestAnimationFrame(() => {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setMode(!reduced && hasWebGL() ? "three" : "css");
    });
    return () => cancelAnimationFrame(id);
  }, []);

  if (mode === "three") return <OrbScene height={height} />;
  return <CssOrb height={height} />;
}
