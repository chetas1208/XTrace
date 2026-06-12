import { createHmac, randomUUID } from "node:crypto";
import type {
  GuildWebhookResult,
  JuaRealityContext,
  ModelServerAnalysisResponse,
  ReasoningSummary,
  TraceProofReport,
} from "@/types/traceproof";
import { getGuildConfig, isGuildWebhookReady } from "@/lib/server/sponsorConfig";

/**
 * Guild webhook integration — server-side only. No Guild API key required.
 */

const GUILD_TIMEOUT_MS = Number(process.env.GUILD_TIMEOUT_MS ?? 15000);

function signingSecret(): string {
  return (
    (process.env.GUILD_WEBHOOK_SIGNING_SECRET ?? "").trim() ||
    (process.env.GUILD_SIGNIN_SECRET ?? "").trim()
  );
}

export async function sendGuildAnalysisEvent(params: {
  report: TraceProofReport;
  modelServerResponse: ModelServerAnalysisResponse;
  claudeSummary: ReasoningSummary;
  juaContext?: JuaRealityContext;
}): Promise<GuildWebhookResult> {
  const config = getGuildConfig();
  const webhookConfigured = Boolean(config.webhookUrl);
  const secretConfigured = Boolean(signingSecret());

  if (!config.enabled) {
    return {
      enabled: false,
      status: "unavailable",
      event_id: null,
      webhook_url_configured: webhookConfigured,
      event_type: process.env.GUILD_WEBHOOK_EVENT_TYPE ?? "xtrace.analysis.completed",
      limitations: ["Guild is disabled."],
    };
  }

  if (!isGuildWebhookReady({ ...config, signinSecret: signingSecret() })) {
    return {
      enabled: true,
      status: "unavailable",
      event_id: null,
      webhook_url_configured: webhookConfigured,
      event_type: process.env.GUILD_WEBHOOK_EVENT_TYPE ?? "xtrace.analysis.completed",
      limitations: [
        webhookConfigured
          ? "Guild webhook signing secret is not configured."
          : "Guild webhook URL is not configured.",
      ],
    };
  }

  const eventType = process.env.GUILD_WEBHOOK_EVENT_TYPE ?? "xtrace.analysis.completed";
  const signatureHeader = process.env.GUILD_WEBHOOK_SIGNATURE_HEADER ?? "X-Guild-Signature";
  const analysisId = params.report.request_id || params.report.job_id || randomUUID();

  const payload = {
    event_type: eventType,
    analysis_id: analysisId,
    project: "XTrace",
    media_type: params.report.detected_media_type,
    final_label: params.report.final_label,
    risk_score: params.report.risk_score,
    confidence: params.report.confidence,
    model_readiness: params.report.model_readiness,
    signals_summary: params.report.signals.map((s) => ({
      model_name: s.model_name,
      status: s.status,
      modality: s.modality,
      score: s.score,
    })),
    strongest_evidence: params.claudeSummary.strongest_evidence,
    limitations: params.claudeSummary.limitations,
    human_action: params.claudeSummary.human_action,
    sponsor_statuses: params.report.sponsor_statuses,
    timestamp: new Date().toISOString(),
  };

  const body = JSON.stringify(payload);
  const signature = createHmac("sha256", signingSecret()).update(body).digest("hex");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GUILD_TIMEOUT_MS);

  try {
    const res = await fetch(config.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [signatureHeader]: `sha256=${signature}`,
        "X-XTrace-Event": eventType,
      },
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
        webhook_url_configured: true,
        event_type: eventType,
        limitations: [`Guild webhook request failed (HTTP ${res.status}).`],
      };
    }

    return {
      enabled: true,
      status: "success",
      event_id: analysisId,
      webhook_url_configured: true,
      event_type: eventType,
      limitations: [
        "Guild records this XTrace analysis as an agent/session event through a webhook trigger.",
      ],
    };
  } catch (error) {
    console.error("[guildWebhookClient] webhook request failed:", error);
    return {
      enabled: true,
      status: "failed",
      event_id: analysisId,
      webhook_url_configured: true,
      event_type: eventType,
      limitations: ["Guild webhook request failed."],
    };
  } finally {
    clearTimeout(timer);
  }
}
