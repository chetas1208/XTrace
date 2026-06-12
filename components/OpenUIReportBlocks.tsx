import { Activity, Cpu, ListChecks, ShieldAlert, Boxes, CloudSun, Workflow } from "lucide-react";
import type { XTraceBlockSeverity, XTraceBlockType, XTraceUIBlock } from "@/types/traceproof";
import { cn } from "@/lib/utils";

/**
 * OpenUI-compatible dynamic report blocks.
 *
 * Claude (or the deterministic fallback) emits report_blocks in a strict
 * schema. We render each one as a SAFE React component from a fixed whitelist.
 * Unknown block types are ignored. No raw HTML, no model-generated code is ever
 * executed — only text and list items are rendered.
 */

const ALLOWED: Record<XTraceBlockType, true> = {
  risk_summary: true,
  signal_cluster: true,
  limitation: true,
  action: true,
  sponsor_trace: true,
  reality_context: true,
  model_readiness: true,
};

const ICONS: Record<XTraceBlockType, typeof Activity> = {
  risk_summary: Activity,
  signal_cluster: Workflow,
  limitation: ShieldAlert,
  action: ListChecks,
  sponsor_trace: Boxes,
  reality_context: CloudSun,
  model_readiness: Cpu,
};

function severityClass(severity: XTraceBlockSeverity): string {
  if (severity === "high") return "border-red-risk/45 bg-red-risk/10";
  if (severity === "medium") return "border-amber-risk/40 bg-amber-risk/10";
  if (severity === "low") return "border-green-verified/35 bg-green-verified/10";
  return "border-border bg-background/50";
}

function isAllowed(type: string): type is XTraceBlockType {
  return Object.prototype.hasOwnProperty.call(ALLOWED, type);
}

export function OpenUIReportBlocks({ blocks }: { blocks: XTraceUIBlock[] }) {
  const safe = blocks.filter((b) => isAllowed(b.type));
  if (safe.length === 0) return null;

  return (
    <section className="xt-glass rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-text-primary">Dynamic report blocks</h2>
        <span className="rounded-md border border-cyan-signal/30 bg-cyan-signal/10 px-2 py-1 text-[0.65rem] uppercase tracking-[0.14em] text-cyan-signal">
          OpenUI
        </span>
      </div>
      <p className="mt-1 text-xs text-text-secondary">
        Rendered from a whitelisted block schema. Unknown block types are ignored; no model-generated HTML is executed.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {safe.map((block, index) => {
          const Icon = ICONS[block.type];
          return (
            <article key={index} className={cn("rounded-xl border p-4", severityClass(block.severity))}>
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-cyan-signal" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-text-primary">{block.title || block.type}</h3>
                <span className="ml-auto text-[0.6rem] uppercase tracking-wide text-text-secondary">{block.type}</span>
              </div>
              {block.content ? <p className="mt-2 text-sm leading-6 text-text-secondary">{block.content}</p> : null}
              {block.items.length > 0 ? (
                <ul className="mt-2 space-y-1.5">
                  {block.items.map((item, i) => (
                    <li key={i} className="text-xs leading-5 text-text-primary">
                      • {item}
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
