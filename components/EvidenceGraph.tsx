"use client";

import { useMemo } from "react";
import { Workflow } from "lucide-react";
import type { ModelSignal, ReasoningLayerMeta } from "@/types/traceproof";
import { cn } from "@/lib/utils";

/**
 * Forensic evidence graph: the analysis pipeline as connected nodes
 * (File -> Provenance / Image / Video / Audio -> Fusion -> Claude -> Actions).
 * Completed nodes glow; unavailable/failed nodes are gray/red. Clicking a node
 * scrolls to the related report section. Pure SVG/CSS — no WebGL — so it always
 * renders and respects reduced motion via the .xt-animate-* classes.
 */

type NodeState = "complete" | "unavailable" | "failed" | "idle";

type GraphNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  state: NodeState;
  scrollTo?: string;
};

function stateFromSignals(signals: ModelSignal[], modality: ModelSignal["modality"]): NodeState {
  const matching = signals.filter((s) => s.modality === modality);
  if (matching.length === 0) return "idle";
  if (matching.some((s) => s.status === "success")) return "complete";
  if (matching.some((s) => s.status === "failed")) return "failed";
  return "unavailable";
}

const STATE_COLOR: Record<NodeState, string> = {
  complete: "#39d0ff",
  unavailable: "#f7b955",
  failed: "#ff5f6d",
  idle: "#475569",
};

export function EvidenceGraph({
  signals,
  reasoningLayer,
  hasActions,
}: {
  signals: ModelSignal[];
  reasoningLayer: ReasoningLayerMeta;
  hasActions: boolean;
}) {
  const nodes = useMemo<GraphNode[]>(() => {
    const provenance = stateFromSignals(signals, "provenance");
    const image = stateFromSignals(signals, "image");
    const video = stateFromSignals(signals, "video");
    const audio = stateFromSignals(signals, "audio");
    const fusion: NodeState = signals.some((s) => s.status === "success") ? "complete" : "unavailable";
    const claude: NodeState =
      reasoningLayer.status === "success" || reasoningLayer.status === "fallback_used" ? "complete" : "unavailable";

    return [
      { id: "file", label: "File", x: 60, y: 110, state: "complete", scrollTo: "media-preview" },
      { id: "provenance", label: "Provenance", x: 210, y: 30, state: provenance, scrollTo: "model-signals" },
      { id: "image", label: "Image", x: 210, y: 90, state: image, scrollTo: "model-signals" },
      { id: "video", label: "Video", x: 210, y: 150, state: video, scrollTo: "model-signals" },
      { id: "audio", label: "Audio", x: 210, y: 200, state: audio, scrollTo: "model-signals" },
      { id: "fusion", label: "Fusion", x: 380, y: 110, state: fusion, scrollTo: "risk" },
      { id: "claude", label: "Claude", x: 520, y: 110, state: claude, scrollTo: "claude" },
      { id: "actions", label: "Actions", x: 650, y: 110, state: hasActions ? "complete" : "idle", scrollTo: "actions" },
    ];
  }, [signals, reasoningLayer, hasActions]);

  const byId = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);
  const edges: Array<[string, string]> = [
    ["file", "provenance"],
    ["file", "image"],
    ["file", "video"],
    ["file", "audio"],
    ["provenance", "fusion"],
    ["image", "fusion"],
    ["video", "fusion"],
    ["audio", "fusion"],
    ["fusion", "claude"],
    ["claude", "actions"],
  ];

  function scrollTo(id?: string) {
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section className="xt-glass rounded-2xl p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
        <Workflow className="h-5 w-5 text-cyan-signal" aria-hidden="true" />
        Forensic evidence graph
      </h2>
      <p className="mt-1 text-xs text-text-secondary">
        Pipeline flow from file to actions. Completed stages glow; unavailable stages are amber, failed are red. Click a
        node to jump to its section.
      </p>

      <div className="mt-4 overflow-x-auto">
        <svg viewBox="0 0 710 240" className="h-[240px] w-full min-w-[640px]" role="img" aria-label="Analysis pipeline graph">
          {edges.map(([from, to], i) => {
            const a = byId[from];
            const b = byId[to];
            const active = a.state === "complete" && b.state !== "idle";
            return (
              <line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={active ? "rgba(57,208,255,0.5)" : "rgba(71,85,105,0.4)"}
                strokeWidth={active ? 2 : 1.25}
                strokeDasharray={active ? "0" : "4 4"}
              />
            );
          })}
          {nodes.map((n) => {
            const color = STATE_COLOR[n.state];
            return (
              <g
                key={n.id}
                transform={`translate(${n.x}, ${n.y})`}
                className="cursor-pointer"
                onClick={() => scrollTo(n.scrollTo)}
                role="button"
                aria-label={`${n.label}: ${n.state}`}
              >
                <circle
                  r={16}
                  fill="rgba(11,16,24,0.9)"
                  stroke={color}
                  strokeWidth={2}
                  className={n.state === "complete" ? "xt-animate-pulse-node" : undefined}
                  style={n.state === "complete" ? { filter: `drop-shadow(0 0 6px ${color})` } : undefined}
                />
                <circle r={5} fill={color} />
                <text x={0} y={32} textAnchor="middle" fontSize="11" fill="#a8b3c7">
                  {n.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-2 flex flex-wrap gap-3 text-[0.65rem] text-text-secondary">
        {(["complete", "unavailable", "failed", "idle"] as NodeState[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full")} style={{ backgroundColor: STATE_COLOR[s] }} />
            {s}
          </span>
        ))}
      </div>
    </section>
  );
}
