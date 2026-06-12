import { Cpu } from "lucide-react";
import type { ModelReadiness } from "@/types/traceproof";
import { cn } from "@/lib/utils";

const STATUS_CLASS = {
  ready: "border-green-verified/40 bg-green-verified/10 text-green-verified",
  notReady: "border-red-risk/45 bg-red-risk/10 text-red-risk",
};

export function ModelReadinessCard({ readiness }: { readiness: ModelReadiness }) {
  return (
    <section className="xt-glass rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
          <Cpu className="h-5 w-5 text-cyan-signal" aria-hidden="true" />
          GPU Model Readiness
        </h2>
        <span
          className={cn(
            "rounded-md border px-2 py-1 text-xs font-medium",
            readiness.ready ? STATUS_CLASS.ready : STATUS_CLASS.notReady,
          )}
        >
          {readiness.ready ? "ready" : "not ready"}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-text-secondary">{readiness.message}</p>

      {!readiness.ready ? (
        <p className="mt-3 rounded-md border border-amber-risk/35 bg-amber-risk/10 px-3 py-2 text-sm text-amber-risk">
          Required GPU models are not ready. No fallback scores were used.
        </p>
      ) : null}

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Loaded</dt>
          <dd className="mt-1 text-sm text-text-primary">
            {readiness.loaded.length ? readiness.loaded.join(", ") : "N/A"}
          </dd>
        </div>
        <div>
          <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Strict mode</dt>
          <dd className="mt-1 text-sm text-text-primary">{readiness.strict_mode ? "enabled" : "disabled"}</dd>
        </div>
        {readiness.missing.length > 0 ? (
          <div className="sm:col-span-2">
            <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-red-risk">Missing</dt>
            <dd className="mt-1 text-sm text-text-primary">{readiness.missing.join(", ")}</dd>
          </div>
        ) : null}
        {readiness.unavailable.length > 0 ? (
          <div className="sm:col-span-2">
            <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-amber-risk">Unavailable</dt>
            <dd className="mt-1 text-sm text-text-primary">{readiness.unavailable.join(", ")}</dd>
          </div>
        ) : null}
        {readiness.failed.length > 0 ? (
          <div className="sm:col-span-2">
            <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-red-risk">Failed</dt>
            <dd className="mt-1 text-sm text-text-primary">{readiness.failed.join(", ")}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
