"use client";

import { Check, CircleAlert } from "lucide-react";
import type { AgentStep } from "@/types/traceproof";
import { cn } from "@/lib/utils";

const STEP_CLASS: Record<AgentStep["status"], string> = {
  success: "border-green-verified/50 bg-green-verified/10 text-green-verified",
  failed: "border-red-risk/50 bg-red-risk/10 text-red-risk",
  unavailable: "border-amber-risk/40 bg-amber-risk/10 text-amber-risk",
  skipped: "border-border bg-panel-soft text-text-secondary",
};

export function AgentStepsPanel({ steps }: { steps: AgentStep[] }) {
  if (!steps.length) return null;

  return (
    <section className="xt-glass rounded-2xl p-5">
      <h2 className="text-lg font-semibold text-text-primary">Agent pipeline</h2>
      <p className="mt-1 text-xs text-text-secondary">XTrace web-agent execution trace for this analysis.</p>
      <ol className="mt-4 space-y-3">
        {steps.map((step, index) => (
          <li key={`${step.name}-${index}`} className="flex items-start gap-3">
            <span
              className={cn(
                "grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs",
                STEP_CLASS[step.status],
              )}
            >
              {step.status === "success" ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : step.status === "failed" ? (
                <CircleAlert className="h-4 w-4" aria-hidden="true" />
              ) : (
                <span>{index + 1}</span>
              )}
            </span>
            <div>
              <p className="text-sm font-medium text-text-primary">{step.name}</p>
              <p className="text-xs leading-5 text-text-secondary">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
