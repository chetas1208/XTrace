import { traceProofReportSchema, actionInputSchema } from "@/lib/schemas";
import type { TraceProofReport } from "@/types/traceproof";

const DEFAULT_SPONSOR_STATUSES: TraceProofReport["sponsor_statuses"] = {
  render: { enabled: true, role: "hosts public web agent" },
  guild: { enabled: true, configured: false, status: "unavailable", mode: "webhook" },
  composio: { enabled: true, configured: false },
  openui: { enabled: true },
  jua: { enabled: false, status: "skipped" },
  anthropic: { configured: false, status: "unavailable" },
};

export function reportFromActionBody(body: unknown) {
  const parsed = actionInputSchema.safeParse(body);
  if (!parsed.success) return null;

  const minimal = parsed.data.report;
  return traceProofReportSchema.safeParse({
    ...minimal,
    job_id: minimal.job_id ?? "session",
    request_id: minimal.request_id ?? "session",
    created_at: new Date().toISOString(),
    status: "completed",
    summary: minimal.summary ?? "",
    report_blocks: [],
    agent_steps: [],
    guild: null,
    guild_webhook: minimal.guild_webhook ?? null,
    model_readiness: minimal.model_readiness ?? {
      ready: true,
      missing: [],
      unavailable: [],
      failed: [],
      loaded: [],
      message: "",
      strict_mode: true,
    },
    sponsor_statuses: DEFAULT_SPONSOR_STATUSES,
    media_claim: null,
    reality_context: minimal.reality_context ?? null,
    raw_model_response: {},
    reasoning_layer: minimal.reasoning_layer ?? {
      provider: "Anthropic Claude",
      model: null,
      status: "unavailable",
      note: "",
    },
  });
}
