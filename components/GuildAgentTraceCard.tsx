import { Network } from "lucide-react";
import type { GuildWebhookResult } from "@/types/traceproof";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<GuildWebhookResult["status"], string> = {
  success: "border-green-verified/40 bg-green-verified/10 text-green-verified",
  failed: "border-red-risk/45 bg-red-risk/10 text-red-risk",
  unavailable: "border-amber-risk/40 bg-amber-risk/10 text-amber-risk",
};

const FALLBACK_AGENTS = [
  { name: "xtrace-orchestrator", role: "coordinates analysis trace" },
  { name: "xtrace-evidence-auditor", role: "reviews model readiness and detector limitations" },
  { name: "xtrace-action-reviewer", role: "reviews Composio action suitability" },
  { name: "xtrace-reality-context-reviewer", role: "reviews weather/location/time context" },
  { name: "xtrace-report-governor", role: "checks report language and score preservation" },
];

function labelFor(name: string): string {
  return name.replace(/^xtrace-/, "").replaceAll("-", " ");
}

export function GuildAgentTraceCard({ webhook }: { webhook: GuildWebhookResult | null }) {
  const status = webhook?.status ?? "unavailable";
  const agents = webhook?.agents.length ? webhook.agents : FALLBACK_AGENTS;
  const active = agents.find((agent) => agent.name === "xtrace-orchestrator") ?? agents[0];
  const plannedSource = agents.length > 1 ? agents : FALLBACK_AGENTS;
  const planned = plannedSource.filter((agent) => agent.name !== active.name);

  return (
    <section className="xt-glass rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
          <Network className="h-5 w-5 text-cyan-signal" aria-hidden="true" />
          Guild Agent Trace
        </h2>
        <span className={cn("rounded-md border px-2 py-1 text-xs font-medium", STATUS_CLASS[status])}>{status}</span>
      </div>

      <p className="mt-2 text-sm leading-6 text-text-secondary">
        Guild records this XTrace investigation as an agent/session trace through a webhook trigger.
      </p>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Guild mode</dt>
          <dd className="mt-1 text-sm text-text-primary">webhook</dd>
        </div>
        <div>
          <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Event status</dt>
          <dd className="mt-1 text-sm text-text-primary">{status}</dd>
        </div>
        <div>
          <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Event type</dt>
          <dd className="mt-1 break-all font-mono text-xs text-text-primary">
            {webhook?.event_type ?? "xtrace.analysis.completed"}
          </dd>
        </div>
        <div>
          <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Signed</dt>
          <dd className="mt-1 text-sm text-text-primary">{webhook?.signed ? "yes" : "no"}</dd>
        </div>
      </dl>

      <div className="mt-5 grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded-md border border-border bg-background/45 p-3">
          <p className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Active agent</p>
          <p className="mt-2 font-mono text-sm text-text-primary">{active.name}</p>
          <p className="mt-1 text-xs leading-5 text-text-secondary">{active.role}</p>
        </div>

        <div className="rounded-md border border-border bg-background/45 p-3">
          <p className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Planned agents</p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {planned.map((agent) => (
              <li key={agent.name} className="text-xs leading-5 text-text-secondary">
                <span className="font-medium capitalize text-text-primary">{labelFor(agent.name)}</span>
                <br />
                {agent.role}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {webhook?.event_id ? (
        <p className="mt-4 break-all font-mono text-xs text-text-secondary">Event ID: {webhook.event_id}</p>
      ) : null}
      {webhook?.limitations.length ? (
        <ul className="mt-4 space-y-1.5">
          {webhook.limitations.map((limitation, index) => (
            <li key={index} className="text-xs leading-5 text-text-secondary">
              {limitation}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
