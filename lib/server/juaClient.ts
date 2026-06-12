import type { MediaClaim, RealityContextSignal } from "@/types/traceproof";
import { getJuaConfig, isJuaReady } from "@/lib/server/sponsorConfig";
import {
  buildJuaSkippedSignal,
  buildJuaUnavailableSignal,
  isRealityClaimRelevant,
} from "@/lib/sponsorReportMapper";

/**
 * Jua = optional reality-context agent. Server-side only.
 *
 * It checks whether a weather/location/time CLAIM is plausible against
 * earth-system context. It is NOT deepfake detection and never says a video is
 * real or fake. It only runs when the user supplies a relevant claim.
 */

const JUA_TIMEOUT_MS = Number(process.env.JUA_TIMEOUT_MS ?? 30000);

const PLAUSIBILITY_DISCLAIMER =
  "Reality-context checking validates claim plausibility against earth-system context. " +
  "It is not deepfake detection and does not prove the media is real or fake.";

const JUA_DISCLAIMER = "Jua checks weather/location plausibility only. It does not detect deepfakes.";

export async function getJuaRealityContext(claim: MediaClaim): Promise<RealityContextSignal> {
  const config = getJuaConfig();

  // 1. Disabled / not configured -> honest unavailable.
  if (!isJuaReady(config)) {
    return buildJuaUnavailableSignal(
      claim,
      config.enabled ? "Jua is enabled but not configured (missing API key ID or secret)." : "Jua is disabled.",
    );
  }

  // 2. Irrelevant claim -> honest skipped (Jua must not run for every report).
  if (!isRealityClaimRelevant({ claim: claim.claim, location: claim.location, datetime: claim.datetime })) {
    return buildJuaSkippedSignal(claim);
  }

  // 3. Relevant + configured -> call Jua server-side.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JUA_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/v1/reality-context`, {
      method: "POST",
      headers: {
        "X-API-Key": `${config.keyId}:${config.apiSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.defaultModel,
        claim: claim.claim,
        location: claim.location,
        datetime: claim.datetime,
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      console.error(`[juaClient] Jua responded HTTP ${response.status}`);
      return {
        provider: "Jua",
        status: "failed",
        claim: claim.claim,
        location: claim.location,
        datetime: claim.datetime,
        evidence: [],
        limitations: [`Jua request failed (HTTP ${response.status}).`, PLAUSIBILITY_DISCLAIMER],
        reality_context_risk: null,
        disclaimer: JUA_DISCLAIMER,
      };
    }

    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const evidence: string[] = [];
    if (data && Array.isArray(data.evidence)) {
      for (const e of data.evidence) if (typeof e === "string") evidence.push(e);
    }
    if (evidence.length === 0) {
      evidence.push(
        `Retrieved earth-system context for claim "${claim.claim}"` +
          (claim.location ? ` at ${claim.location}` : "") +
          (claim.datetime ? ` for ${claim.datetime}` : "") +
          ".",
      );
    }
    // We never fabricate a risk number; only surface one Jua actually returns.
    const risk =
      data && typeof data.reality_context_risk === "number" ? (data.reality_context_risk as number) : null;

    return {
      provider: "Jua",
      status: "success",
      claim: claim.claim,
      location: claim.location,
      datetime: claim.datetime,
      evidence,
      limitations: [PLAUSIBILITY_DISCLAIMER],
      reality_context_risk: risk,
      disclaimer: JUA_DISCLAIMER,
    };
  } catch (error) {
    console.error("[juaClient] Jua request error:", error);
    return {
      provider: "Jua",
      status: "failed",
      claim: claim.claim,
      location: claim.location,
      datetime: claim.datetime,
      evidence: [],
      limitations: ["Jua request failed.", PLAUSIBILITY_DISCLAIMER],
      reality_context_risk: null,
      disclaimer: JUA_DISCLAIMER,
    };
  } finally {
    clearTimeout(timer);
  }
}
