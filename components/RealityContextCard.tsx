"use client";

import { useState } from "react";
import { CloudSun, Loader2 } from "lucide-react";
import type { MediaClaim, RealityContextSignal } from "@/types/traceproof";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function statusClass(status: RealityContextSignal["status"]): string {
  if (status === "success") return "border-green-verified/40 bg-green-verified/10 text-green-verified";
  if (status === "failed") return "border-red-risk/45 bg-red-risk/10 text-red-risk";
  return "border-amber-risk/40 bg-amber-risk/10 text-amber-risk"; // unavailable / skipped
}

export function RealityContextCard({
  jobId,
  mediaClaim,
  initialContext,
}: {
  jobId: string;
  mediaClaim: MediaClaim;
  initialContext: RealityContextSignal | null;
}) {
  const [context, setContext] = useState<RealityContextSignal | null>(initialContext);
  const [running, setRunning] = useState(false);

  async function runCheck() {
    setRunning(true);
    try {
      const response = await fetch("/api/reality-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const data = (await response.json().catch(() => null)) as RealityContextSignal | null;
      if (data) setContext(data);
    } catch {
      // Leave prior context; the button can be retried.
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="xt-glass rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
          <CloudSun className="h-5 w-5 text-cyan-signal" aria-hidden="true" />
          Reality context: Jua
        </h2>
        {context ? (
          <span className={cn("rounded-md border px-2 py-1 text-xs font-medium", statusClass(context.status))}>
            {context.status}
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-sm leading-6 text-text-secondary">
        Jua checks whether a weather/location/time claim is consistent with external earth-system context. This is not
        deepfake detection; it is media-claim plausibility checking.
      </p>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Claim</dt>
          <dd className="mt-1 text-sm text-text-primary">{mediaClaim.claim || "(none)"}</dd>
        </div>
        <div>
          <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Location</dt>
          <dd className="mt-1 text-sm text-text-primary">{mediaClaim.location || "N/A"}</dd>
        </div>
        <div>
          <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Date / time</dt>
          <dd className="mt-1 text-sm text-text-primary">{mediaClaim.datetime || "N/A"}</dd>
        </div>
        <div>
          <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Context risk</dt>
          <dd className="mt-1 text-sm text-text-primary">
            {context?.reality_context_risk ?? "N/A"}
          </dd>
        </div>
      </dl>

      {context ? (
        <div className="mt-4 space-y-3">
          {context.evidence.length > 0 ? (
            <div>
              <p className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Evidence</p>
              <ul className="mt-2 space-y-1.5">
                {context.evidence.map((e, index) => (
                  <li key={index} className="text-xs leading-5 text-text-primary">
                    • {e}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {context.limitations.length > 0 ? (
            <div>
              <p className="text-[0.65rem] uppercase tracking-[0.14em] text-amber-risk">Limitations</p>
              <ul className="mt-2 space-y-1.5">
                {context.limitations.map((l, index) => (
                  <li key={index} className="text-xs leading-5 text-text-secondary">
                    • {l}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {context.disclaimer ? (
            <p className="border-t border-border pt-3 text-xs leading-6 text-text-secondary">{context.disclaimer}</p>
          ) : null}
        </div>
      ) : (
        <Button type="button" className="mt-4" variant="secondary" disabled={running} onClick={runCheck}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Run reality-context check
        </Button>
      )}
    </section>
  );
}
