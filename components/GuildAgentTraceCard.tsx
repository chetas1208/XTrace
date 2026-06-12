import { Network, ExternalLink } from "lucide-react";
import type { GuildWebhookResult } from "@/types/traceproof";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<GuildWebhookResult["status"], string> = {
  success: "border-green-verified/40 bg-green-verified/10 text-green-verified",
  failed: "border-red-risk/45 bg-red-risk/10 text-red-risk",
  unavailable: "border-amber-risk/40 bg-amber-risk/10 text-amber-risk",
};

function agentStatusClass(status: string): string {
  const s = status.toUpperCase();
  if (s === "READY") return "border-green-verified/40 bg-green-verified/10 text-green-verified";
  if (s === "FAILED" || s === "ERROR") return "border-red-risk/45 bg-red-risk/10 text-red-risk";
  return "border-cyan-signal/40 bg-cyan-signal/10 text-cyan-signal";
}

function labelFor(name: string): string {
  return name.replace(/^x?trace-/, "").replaceAll("-", " ");
}

export function GuildAgentTraceCard({ webhook }: { webhook: GuildWebhookResult | null }) {
  const status = webhook?.status ?? "unavailable";
  const liveAgents = webhook?.live_agents ?? [];
  const total = webhook?.live_agents_total ?? liveAgents.length;
  // Fall back to the conceptual plan only when the live roster is unavailable.
  const planAgents = webhook?.agents ?? [];

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
        Guild records this XTrace investigation as an agent/session trace, and the live agent roster below is fetched
        directly from the Guild control plane.
      </p>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Guild mode</dt>
          <dd className="mt-1 text-sm text-text-primary">webhook + control plane</dd>
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

      <div className="mt-5">
        <div className="flex items-center justify-between">
          <p className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Live Guild agents</p>
          {liveAgents.length ? (
            <span className="text-[0.65rem] text-text-secondary">
              {liveAgents.length} of {total} fetched
            </span>
          ) : null}
        </div>

        {liveAgents.length ? (
          <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {liveAgents.map((agent) => (
              <li
                key={agent.id || agent.full_name}
                className="rounded-md border border-border bg-background/45 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  {agent.profile_url ? (
                    <a
                      href={agent.profile_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm font-medium capitalize text-text-primary hover:text-cyan-signal"
                    >
                      {labelFor(agent.name)}
                      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                    </a>
                  ) : (
                    <span className="text-sm font-medium capitalize text-text-primary">{labelFor(agent.name)}</span>
                  )}
                  <span
                    className={cn(
                      "shrink-0 rounded-md border px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide",
                      agentStatusClass(agent.status),
                    )}
                  >
                    {agent.status.toLowerCase()}
                  </span>
                </div>
                <p className="mt-1 font-mono text-[0.7rem] text-text-secondary">{agent.full_name}</p>
                {agent.description ? (
                  <p className="mt-1.5 text-xs leading-5 text-text-secondary">{agent.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : webhook?.live_agents_status === "failed" ? (
          <p className="mt-3 text-xs text-amber-risk">
            Live Guild agent roster could not be fetched. Showing the planned agent set instead.
          </p>
        ) : null}

        {!liveAgents.length && planAgents.length ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {planAgents.map((agent) => (
              <li key={agent.name} className="text-xs leading-5 text-text-secondary">
                <span className="font-medium capitalize text-text-primary">{labelFor(agent.name)}</span>
                <br />
                {agent.role}
              </li>
            ))}
          </ul>
        ) : null}
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
