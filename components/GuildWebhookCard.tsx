import { Webhook } from "lucide-react";
import type { GuildWebhookResult } from "@/types/traceproof";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<GuildWebhookResult["status"], string> = {
  success: "border-green-verified/40 bg-green-verified/10 text-green-verified",
  failed: "border-red-risk/45 bg-red-risk/10 text-red-risk",
  unavailable: "border-amber-risk/40 bg-amber-risk/10 text-amber-risk",
};

export function GuildWebhookCard({ webhook }: { webhook: GuildWebhookResult | null }) {
  const status = webhook?.status ?? "unavailable";

  return (
    <section className="xt-glass rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
          <Webhook className="h-5 w-5 text-cyan-signal" aria-hidden="true" />
          Guild Agent Session Trace
        </h2>
        <span className={cn("rounded-md border px-2 py-1 text-xs font-medium", STATUS_CLASS[status])}>{status}</span>
      </div>

      <p className="mt-2 text-sm leading-6 text-text-secondary">
        Guild records this XTrace analysis as an agent/session event through a webhook trigger.
      </p>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Webhook configured</dt>
          <dd className="mt-1 text-sm text-text-primary">{webhook?.webhook_configured ? "yes" : "no"}</dd>
        </div>
        <div>
          <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Event type</dt>
          <dd className="mt-1 font-mono text-xs text-text-primary">{webhook?.event_type ?? "xtrace.analysis.completed"}</dd>
        </div>
        {webhook?.event_id ? (
          <div className="sm:col-span-2">
            <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Event ID</dt>
            <dd className="mt-1 break-all font-mono text-xs text-text-primary">{webhook.event_id}</dd>
          </div>
        ) : null}
      </dl>

      {webhook?.limitations.length ? (
        <ul className="mt-4 space-y-1.5">
          {webhook.limitations.map((l, index) => (
            <li key={index} className="text-xs leading-5 text-text-secondary">
              • {l}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
