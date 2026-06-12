import { BrainCircuit } from "lucide-react";
import type { ReasoningLayerMeta } from "@/types/traceproof";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<ReasoningLayerMeta["status"], string> = {
  success: "Success",
  fallback_used: "Fallback model used",
  unavailable: "Unavailable (deterministic fallback)",
};

function statusClassName(status: ReasoningLayerMeta["status"]): string {
  if (status === "success") return "border-green-verified/40 bg-green-verified/10 text-green-verified";
  if (status === "fallback_used") return "border-amber-risk/40 bg-amber-risk/10 text-amber-risk";
  return "border-border bg-panel-soft text-text-secondary";
}

export function ClaudeReasoningCard({
  reasoningLayer,
  confidenceRationale,
  weakestEvidence,
}: {
  reasoningLayer: ReasoningLayerMeta;
  confidenceRationale: string;
  weakestEvidence: string[];
}) {
  return (
    <section className="xt-glass rounded-2xl p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
        <BrainCircuit className="h-5 w-5 text-cyan-signal" aria-hidden="true" />
        Claude forensic reasoning
      </h2>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Provider</dt>
          <dd className="mt-1 text-sm text-text-primary">Anthropic Claude</dd>
        </div>
        <div>
          <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Model</dt>
          <dd className="mt-1 break-all font-mono text-xs text-text-primary">{reasoningLayer.model ?? "deterministic fallback"}</dd>
        </div>
        <div>
          <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Status</dt>
          <dd className="mt-1">
            <span className={cn("rounded-md border px-2 py-1 text-xs font-medium", statusClassName(reasoningLayer.status))}>
              {STATUS_LABEL[reasoningLayer.status]}
            </span>
          </dd>
        </div>
      </dl>

      {confidenceRationale ? (
        <div className="mt-4">
          <p className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Confidence rationale</p>
          <p className="mt-1 text-sm leading-6 text-text-secondary">{confidenceRationale}</p>
        </div>
      ) : null}

      {weakestEvidence.length > 0 ? (
        <div className="mt-4">
          <p className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Weakest / unavailable signals</p>
          <ul className="mt-2 space-y-1.5">
            {weakestEvidence.map((item, index) => (
              <li key={index} className="text-xs leading-5 text-text-secondary">
                • {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-4 border-t border-border pt-3 text-xs leading-6 text-text-secondary">
        Claude summarizes evidence only. It does not perform detection or modify model scores.
      </p>
    </section>
  );
}
