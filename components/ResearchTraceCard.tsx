import { Boxes, FileBox } from "lucide-react";
import type { GuildTrace } from "@/types/traceproof";
import { cn, formatRuntime } from "@/lib/utils";

const STATUS_CLASS: Record<GuildTrace["status"], string> = {
  success: "border-green-verified/40 bg-green-verified/10 text-green-verified",
  failed: "border-red-risk/45 bg-red-risk/10 text-red-risk",
  unavailable: "border-amber-risk/40 bg-amber-risk/10 text-amber-risk",
  skipped: "border-border bg-panel-soft text-text-secondary",
};

/**
 * Guild AI run-ledger card. Renders the trace from the model server, or an
 * honest "unavailable" state when no Guild data was returned. Never fabricates
 * a run id.
 */
export function ResearchTraceCard({ guild }: { guild: GuildTrace | null }) {
  return (
    <section className="xt-glass rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
          <Boxes className="h-5 w-5 text-cyan-signal" aria-hidden="true" />
          Research trace: Guild AI run ledger
        </h2>
        {guild ? (
          <span className={cn("rounded-md border px-2 py-1 text-xs font-medium", STATUS_CLASS[guild.status])}>
            {guild.status}
          </span>
        ) : (
          <span className="rounded-md border border-amber-risk/40 bg-amber-risk/10 px-2 py-1 text-xs font-medium text-amber-risk">
            unavailable
          </span>
        )}
      </div>

      <p className="mt-2 text-sm leading-6 text-text-secondary">
        Guild AI tracks this forensic analysis as a reproducible ML run. It records model outputs, metrics, and
        artifacts so the report can be audited later.
      </p>

      {!guild ? (
        <p className="mt-4 rounded-md border border-border bg-background/55 p-3 text-sm text-text-secondary">
          Guild AI run ledger unavailable. The model server did not attach a Guild run trace to this analysis.
        </p>
      ) : (
        <>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Run ID</dt>
              <dd className="mt-1 break-all font-mono text-xs text-text-primary">{guild.run_id ?? "N/A"}</dd>
            </div>
            <div>
              <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Operation</dt>
              <dd className="mt-1 font-mono text-xs text-text-primary">{guild.operation}</dd>
            </div>
            <div>
              <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Models</dt>
              <dd className="mt-1 text-sm text-text-primary">
                {guild.metrics.num_successful_models} ok · {guild.metrics.num_failed_models} failed
              </dd>
            </div>
            <div>
              <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Runtime</dt>
              <dd className="mt-1 text-sm text-text-primary">{formatRuntime(guild.metrics.runtime_ms)}</dd>
            </div>
          </dl>

          <div className="mt-4">
            <p className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Artifacts</p>
            {guild.artifacts.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {guild.artifacts.map((a, index) => (
                  <li key={index} className="flex items-center gap-2 text-xs text-text-primary">
                    <FileBox className="h-3.5 w-3.5 text-text-secondary" aria-hidden="true" />
                    {a.url ? (
                      <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-cyan-signal underline">
                        {a.name}
                      </a>
                    ) : (
                      <span>
                        {a.name} <span className="text-text-secondary">({a.path || "no path"})</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-text-secondary">No artifacts were recorded for this run.</p>
            )}
          </div>

          {guild.limitations.length > 0 ? (
            <ul className="mt-4 space-y-1.5">
              {guild.limitations.map((l, index) => (
                <li key={index} className="text-xs leading-5 text-text-secondary">
                  • {l}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}
