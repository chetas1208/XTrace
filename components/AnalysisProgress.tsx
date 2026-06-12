"use client";

import { useEffect, useState } from "react";
import { Check, CircleAlert, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ProgressStatus = "idle" | "running" | "done" | "failed";

const STAGES = [
  "Intake Agent",
  "Media Router",
  "Cloudflare Tunnel",
  "GPU Forensics",
  "Claude Reasoning",
  "Guild Webhook",
  "XTrace Report",
] as const;

// Index of the last "in-flight" stage. While running we advance up to here and
// hold; the final "Complete" stage is only shown once the request truly returns.
const LAST_INFLIGHT_INDEX = STAGES.length - 2;

type Props = {
  status: ProgressStatus;
  failureMessage?: string | null;
};

export function AnalysisProgress({ status, failureMessage }: Props) {
  // `tick` is only ever advanced from inside the interval callback (never set
  // synchronously in the effect body). The displayed index is derived so that
  // "done" jumps straight to the final stage without a synchronous setState.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (status !== "running") return undefined;
    const interval = setInterval(() => {
      setTick((current) => (current < LAST_INFLIGHT_INDEX ? current + 1 : current));
    }, 1100);
    return () => clearInterval(interval);
  }, [status]);

  const activeIndex = status === "done" ? STAGES.length - 1 : tick;

  return (
    <section className="rounded-lg border border-border bg-panel p-5" aria-live="polite">
      <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-text-secondary">Analysis pipeline</h2>
      <ol className="mt-4 space-y-3">
        {STAGES.map((stage, index) => {
          const isComplete = status === "done" ? true : index < activeIndex;
          const isCurrent = status !== "done" && index === activeIndex;
          const isFailedHere = status === "failed" && index === activeIndex;

          return (
            <li key={stage} className="flex items-center gap-3">
              <span
                className={cn(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs",
                  isFailedHere && "border-red-risk/50 bg-red-risk/10 text-red-risk",
                  !isFailedHere && isComplete && "border-green-verified/50 bg-green-verified/10 text-green-verified",
                  !isFailedHere && isCurrent && "border-cyan-signal/60 bg-cyan-signal/10 text-cyan-signal",
                  !isFailedHere && !isComplete && !isCurrent && "border-border bg-background/55 text-text-secondary",
                )}
              >
                {isFailedHere ? (
                  <CircleAlert className="h-4 w-4" aria-hidden="true" />
                ) : isComplete ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : isCurrent ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </span>
              <span
                className={cn(
                  "text-sm",
                  isFailedHere ? "text-red-risk" : isComplete || isCurrent ? "text-text-primary" : "text-text-secondary",
                )}
              >
                {stage}
              </span>
            </li>
          );
        })}
      </ol>
      {status === "failed" && failureMessage ? (
        <p className="mt-4 rounded-md border border-red-risk/35 bg-red-risk/10 px-3 py-2 text-sm text-red-risk">
          {failureMessage}
        </p>
      ) : null}
    </section>
  );
}
