import { CloudSun } from "lucide-react";
import type { MediaClaim, RealityContextSignal } from "@/types/traceproof";
import { cn } from "@/lib/utils";

function statusClass(status: RealityContextSignal["status"]): string {
  if (status === "success") return "border-green-verified/40 bg-green-verified/10 text-green-verified";
  if (status === "failed") return "border-red-risk/45 bg-red-risk/10 text-red-risk";
  return "border-amber-risk/40 bg-amber-risk/10 text-amber-risk";
}

export function JuaRealityContextCard({
  mediaClaim,
  context,
}: {
  mediaClaim: MediaClaim | null;
  context: RealityContextSignal | null;
}) {
  const status = context?.status ?? "skipped";

  return (
    <section className="xt-glass rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
          <CloudSun className="h-5 w-5 text-cyan-signal" aria-hidden="true" />
          Jua Reality Context
        </h2>
        <span className={cn("rounded-md border px-2 py-1 text-xs font-medium", statusClass(status))}>{status}</span>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Claim</dt>
          <dd className="mt-1 text-sm text-text-primary">{context?.claim || mediaClaim?.claim || "N/A"}</dd>
        </div>
        <div>
          <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Location</dt>
          <dd className="mt-1 text-sm text-text-primary">{context?.location || mediaClaim?.location || "N/A"}</dd>
        </div>
        <div>
          <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Datetime</dt>
          <dd className="mt-1 text-sm text-text-primary">{context?.datetime || mediaClaim?.datetime || "N/A"}</dd>
        </div>
        <div>
          <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Reality-context risk</dt>
          <dd className="mt-1 text-sm text-text-primary">{context?.reality_context_risk ?? "N/A"}</dd>
        </div>
      </dl>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Evidence</p>
          {context?.evidence.length ? (
            <ul className="mt-2 space-y-1.5">
              {context.evidence.map((item, index) => (
                <li key={index} className="text-xs leading-5 text-text-primary">
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs leading-5 text-text-secondary">No Jua evidence returned for this report.</p>
          )}
        </div>
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Limitations</p>
          {context?.limitations.length ? (
            <ul className="mt-2 space-y-1.5">
              {context.limitations.map((item, index) => (
                <li key={index} className="text-xs leading-5 text-text-secondary">
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs leading-5 text-text-secondary">No limitations returned.</p>
          )}
        </div>
      </div>

      <p className="mt-4 border-t border-border pt-3 text-xs leading-6 text-text-secondary">
        Jua checks plausibility of the claimed weather/location context. It does not detect deepfakes.
      </p>
    </section>
  );
}
