import { createHmac } from "node:crypto";
import type { GuildTrace, ModelServerAnalysisResponse } from "@/types/traceproof";
import { getGuildConfig, isGuildSessionApiReady, isGuildWebhookReady } from "@/lib/server/sponsorConfig";
import { normalizeGuildTrace } from "@/lib/sponsorReportMapper";

/**
 * Guild = agent/session run ledger.
 *
 * Three modes, tried in order:
 *  A. The HPC model server attaches a Guild trace to its response — we display it.
 *  B. If a Guild webhook + signin secret are configured, XTrace posts a signed
 *     run-completed event to the webhook and records it under the analysis's
 *     own request id (a real, non-fabricated correlation id).
 *  C. If the Guild session API is configured, XTrace creates/attaches a session
 *     for this analysis and shows the real session id.
 *
 * Never fabricates a run/session id. If none of the above yields a trace,
 * returns null and the UI shows "Guild run ledger unavailable".
 */

const GUILD_TIMEOUT_MS = Number(process.env.GUILD_TIMEOUT_MS ?? 15000);

function traceFromResponse(response: ModelServerAnalysisResponse): GuildTrace | null {
  const trace = response.sponsor_trace?.guild;
  if (!trace) return null;
  return trace;
}

/** Option B: post a signed run-completed event to the Guild webhook. */
async function postGuildWebhookEvent(response: ModelServerAnalysisResponse): Promise<GuildTrace | null> {
  const config = getGuildConfig();
  if (!isGuildWebhookReady(config)) return null;

  const successCount = response.signals.filter((s) => s.status === "success").length;
  const failedCount = response.signals.length - successCount;

  const payload = JSON.stringify({
    event: "xtrace.analysis.completed",
    request_id: response.request_id,
    operation: "xtrace_multimodal_analysis",
    file_name: response.file_name,
    metrics: {
      risk_score: response.fusion.risk_score,
      confidence: response.fusion.confidence,
      num_successful_models: successCount,
      num_failed_models: failedCount,
      runtime_ms: response.runtime_ms,
    },
  });
  const signature = createHmac("sha256", config.signinSecret).update(payload).digest("hex");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GUILD_TIMEOUT_MS);
  try {
    const res = await fetch(config.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Guild-Signature": `sha256=${signature}`,
      },
      body: payload,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[guildClient] Guild webhook responded HTTP ${res.status}`);
      return null;
    }

    return {
      enabled: true,
      status: "success",
      run_id: response.request_id,
      operation: "xtrace_multimodal_analysis",
      artifacts: [],
      metrics: {
        risk_score: response.fusion.risk_score,
        confidence: response.fusion.confidence,
        num_successful_models: successCount,
        num_failed_models: failedCount,
        runtime_ms: response.runtime_ms,
      },
      limitations: [
        "Guild recorded this analysis via a signed webhook event, keyed by the XTrace request id.",
      ],
    };
  } catch (error) {
    console.error("[guildClient] Guild webhook request failed:", error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Option C: create a Guild session for this analysis via the Guild API. */
async function createGuildSession(response: ModelServerAnalysisResponse): Promise<GuildTrace | null> {
  const config = getGuildConfig();
  if (!isGuildSessionApiReady(config)) return null;

  const successCount = response.signals.filter((s) => s.status === "success").length;
  const failedCount = response.signals.length - successCount;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GUILD_TIMEOUT_MS);
  try {
    const res = await fetch(`${config.appUrl.replace(/\/$/, "")}/api/v1/sessions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: config.workspaceId,
        agent_id: config.agentId || undefined,
        operation: "xtrace_multimodal_analysis",
        metadata: { request_id: response.request_id, file_name: response.file_name },
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[guildClient] Guild session API responded HTTP ${res.status}`);
      return null;
    }
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    const sessionId =
      (data && (typeof data.id === "string" ? data.id : typeof data.session_id === "string" ? data.session_id : null)) ||
      null;
    if (!sessionId) return null; // No real id -> do not fabricate one.

    return {
      enabled: true,
      status: "success",
      run_id: sessionId,
      operation: "xtrace_multimodal_analysis",
      artifacts: [],
      metrics: {
        risk_score: response.fusion.risk_score,
        confidence: response.fusion.confidence,
        num_successful_models: successCount,
        num_failed_models: failedCount,
        runtime_ms: response.runtime_ms,
      },
      limitations: ["Guild records the analysis as an auditable agent session/run."],
    };
  } catch (error) {
    console.error("[guildClient] Guild session creation failed:", error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve a Guild trace for the analysis: prefer the model-server trace, then
 * the webhook ledger, then direct session creation; else null (UI shows
 * unavailable).
 */
export async function resolveGuildTrace(response: ModelServerAnalysisResponse): Promise<GuildTrace | null> {
  const artifactBaseUrl = (process.env.GUILD_ARTIFACT_BASE_URL ?? "").trim();

  const fromServer = traceFromResponse(response);
  if (fromServer) return normalizeGuildTrace(fromServer, artifactBaseUrl);

  const fromWebhook = await postGuildWebhookEvent(response);
  if (fromWebhook) return normalizeGuildTrace(fromWebhook, artifactBaseUrl);

  const fromSession = await createGuildSession(response);
  if (fromSession) return normalizeGuildTrace(fromSession, artifactBaseUrl);

  return null;
}
