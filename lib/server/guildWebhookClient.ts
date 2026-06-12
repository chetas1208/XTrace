import { createHmac, randomUUID } from "node:crypto";
import type {
  ComposioActionStatus,
  ClaudeXTraceSummary,
  GuildWebhookResult,
  JuaRealityContext,
  ModelServerAnalysisResponse,
  TraceProofReport,
  XTraceAgentPlan,
} from "@/types/traceproof";
import { getGuildConfig } from "@/lib/server/sponsorConfig";
import { fetchGuildAgents } from "@/lib/server/guildApiClient";

/**
 * Guild webhook integration — server-side only. No Guild API key required.
 */

const GUILD_TIMEOUT_MS = Number(process.env.GUILD_TIMEOUT_MS ?? 15000);
const DEFAULT_EVENT_TYPE = "xtrace.analysis.completed";

// Mirrors the user's real Guild agents (chetas~xtrace-*). The live roster is
// fetched from the Guild control plane at request time; this is the fallback
// description set used when the live fetch is unavailable.
export const XTRACE_AGENT_PLAN: XTraceAgentPlan = [
  { name: "xtrace-orchestrator", role: "coordinates the analysis trace across detectors, reasoning, and actions" },
  {
    name: "xtrace-evidence-auditor",
    role: "reviews GPU detector signals, required model readiness, unavailable models, and limitations",
  },
  {
    name: "xtrace-report-reviewer",
    role: "verifies that Claude did not claim fake/real certainty or modify detector scores",
  },
];

function signingSecret(): string {
  return (
    (process.env.GUILD_WEBHOOK_SIGNING_SECRET ?? "").trim() ||
    (process.env.GUILD_SIGNIN_SECRET ?? "").trim()
  );
}

export async function sendGuildAnalysisEvent(params: {
  report: TraceProofReport;
  modelServerResponse: ModelServerAnalysisResponse;
  claudeSummary: ClaudeXTraceSummary;
  juaContext?: JuaRealityContext | null;
  composioActions?: ComposioActionStatus[];
  agentPlan?: XTraceAgentPlan;
}): Promise<GuildWebhookResult> {
  const config = getGuildConfig();
  const webhookConfigured = Boolean(config.webhookUrl);
  const secret = signingSecret();
  const signed = Boolean(secret);
  const eventType = config.webhookEventType || DEFAULT_EVENT_TYPE;

  // Fetch the owner's real agents live from the Guild control plane.
  const live = await fetchGuildAgents();
  const liveAgents = live.agents;

  // Prefer the real, live agent roster as the plan; fall back to the static one.
  const planFromLive: XTraceAgentPlan = liveAgents.map((a) => ({
    name: a.name,
    role: a.description || `${a.agent_type || "Guild"} agent (${a.status.toLowerCase()})`,
  }));
  const agentPlan: XTraceAgentPlan = planFromLive.length
    ? planFromLive
    : params.agentPlan?.length
      ? params.agentPlan
      : XTRACE_AGENT_PLAN;

  const baseResult = {
    event_id: null,
    webhook_configured: webhookConfigured,
    webhook_url_configured: webhookConfigured,
    signed,
    event_type: eventType,
    agents: agentPlan,
    live_agents: liveAgents,
    live_agents_total: live.total,
    live_agents_status: live.status,
  };

  if (!config.enabled) {
    return {
      enabled: false,
      status: "unavailable",
      ...baseResult,
      limitations: ["Guild is disabled."],
    };
  }

  if (!webhookConfigured) {
    return {
      enabled: true,
      status: "unavailable",
      ...baseResult,
      limitations: ["Guild webhook URL is not configured."],
    };
  }

  const signatureHeader = config.webhookSignatureHeader || "X-Guild-Webhook-Signature";
  const analysisId = params.report.request_id || params.report.job_id || randomUUID();
  const deliveryId = randomUUID();

  const payload = {
    event_type: eventType,
    project: "XTrace",
    theme: "web-agent",
    analysis_id: analysisId,
    timestamp: new Date().toISOString(),
    media: {
      file_name: params.report.file_name,
      detected_media_type: params.report.detected_media_type,
      optional_claim: params.report.media_claim?.claim || null,
      location: params.report.media_claim?.location ?? null,
      datetime: params.report.media_claim?.datetime ?? null,
    },
    final_result: {
      final_label: params.report.final_label,
      risk_score: params.report.risk_score,
      confidence: params.report.confidence,
      human_action: params.claudeSummary.human_action,
    },
    model_readiness: params.report.model_readiness,
    signals_summary: params.report.signals.map((s) => ({
      model_name: s.model_name,
      status: s.status,
      score: s.score,
      confidence: s.confidence,
      modality: s.modality,
    })),
    strongest_evidence: params.claudeSummary.strongest_evidence,
    weakest_evidence: params.claudeSummary.weakest_evidence,
    limitations: params.claudeSummary.limitations,
    claude: {
      model: params.claudeSummary.reasoning_layer.model,
      status: params.claudeSummary.reasoning_layer.status,
      confidence_rationale: params.claudeSummary.confidence_rationale,
    },
    jua: {
      status: params.juaContext?.status ?? params.report.reality_context?.status ?? "skipped",
      reality_context_risk:
        params.juaContext?.reality_context_risk ?? params.report.reality_context?.reality_context_risk ?? null,
    },
    composio: {
      actions_available: ["github_issue", "slack_summary", "notion_page"],
      actions: (params.composioActions ?? []).map((action) => ({
        action: action.action,
        status: action.status,
        external_url: action.external_url,
      })),
    },
    agent_plan: agentPlan,
  };

  // Guild webhook delivery envelope: { event, action, payload }. The HMAC
  // signature is computed over the exact raw body string Guild will receive.
  const envelope = { event: eventType, action: "completed", payload };
  const body = JSON.stringify(envelope);
  const signature = signed ? createHmac("sha256", secret).update(body).digest("hex") : null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GUILD_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-XTrace-Event": eventType,
      "X-Guild-Webhook-ID": deliveryId,
    };
    if (signature) headers[signatureHeader] = `sha256=${signature}`;

    const res = await fetch(config.webhookUrl, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(`[guildWebhookClient] webhook responded HTTP ${res.status}`);
      return {
        enabled: true,
        status: "failed",
        event_id: analysisId,
        webhook_configured: true,
        webhook_url_configured: true,
        signed,
        event_type: eventType,
        agents: agentPlan,
        live_agents: liveAgents,
        live_agents_total: live.total,
        live_agents_status: live.status,
        limitations: [`Guild webhook request failed (HTTP ${res.status}).`],
      };
    }

    return {
      enabled: true,
      status: "success",
      event_id: analysisId,
      webhook_configured: true,
      webhook_url_configured: true,
      signed,
      event_type: eventType,
      agents: agentPlan,
      live_agents: liveAgents,
      live_agents_total: live.total,
      live_agents_status: live.status,
      limitations: [
        "Guild records this XTrace investigation as an agent/session trace through a webhook trigger.",
        ...(signed ? [] : ["Guild webhook signing secret is not configured; event was sent unsigned."]),
      ],
    };
  } catch (error) {
    console.error("[guildWebhookClient] webhook request failed:", error);
    return {
      enabled: true,
      status: "failed",
      event_id: analysisId,
      webhook_configured: true,
      webhook_url_configured: true,
      signed,
      event_type: eventType,
      agents: agentPlan,
      live_agents: liveAgents,
      live_agents_total: live.total,
      live_agents_status: live.status,
      limitations: ["Guild webhook request failed."],
    };
  } finally {
    clearTimeout(timer);
  }
}
