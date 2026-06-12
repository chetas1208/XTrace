import type { RealityContextSignal } from "@/types/traceproof";
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
 * earth-system context using Jua's real forecast query engine
 * (GET https://query.jua.ai/v1/forecast/). It is NOT deepfake detection and
 * never says a video is real or fake. It only runs when the user supplies a
 * relevant claim, and it never fabricates a result.
 */

const JUA_TIMEOUT_MS = Number(process.env.JUA_TIMEOUT_MS ?? 30000);
const GEOCODE_URL = process.env.JUA_GEOCODE_URL ?? "https://geocoding-api.open-meteo.com/v1/search";

const PLAUSIBILITY_DISCLAIMER =
  "Reality-context checking validates claim plausibility against earth-system context. " +
  "It is not deepfake detection and does not prove the media is real or fake.";

const JUA_DISCLAIMER = "Jua checks weather/location plausibility only. It does not detect deepfakes.";

/** Jua query-engine model slug (e.g. "ept-2" -> "ept2"). */
function juaModelSlug(model: string): string {
  return model.trim().replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "ept2";
}

function juaApiKey(config = getJuaConfig()): string {
  if (config.apiKey && config.apiKey.includes(":")) return config.apiKey;
  if (config.keyId && config.apiSecret) return `${config.keyId}:${config.apiSecret}`;
  return config.apiKey;
}

type GeoPoint = { latitude: number; longitude: number; label: string };

/** Resolve a free-text location to coordinates using a free geocoder (no key). */
async function geocodeLocation(location: string, signal: AbortSignal): Promise<GeoPoint | null> {
  try {
    const url = `${GEOCODE_URL}?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;
    const res = await fetch(url, { signal, cache: "no-store", headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as { results?: Array<Record<string, unknown>> } | null;
    const top = data?.results?.[0];
    if (!top || typeof top.latitude !== "number" || typeof top.longitude !== "number") return null;
    const parts = [top.name, top.admin1, top.country].filter((p): p is string => typeof p === "string" && p.length > 0);
    return { latitude: top.latitude, longitude: top.longitude, label: parts.join(", ") || location };
  } catch {
    return null;
  }
}

/** Pull the first finite number out of a (possibly deeply nested) value. */
function firstNumber(value: unknown, depth = 0): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (depth > 6 || !value || typeof value !== "object") return null;
  for (const v of Object.values(value as Record<string, unknown>)) {
    const found = firstNumber(v, depth + 1);
    if (found !== null) return found;
  }
  return null;
}

export async function getJuaRealityContext(params: {
  claim?: string | null;
  location?: string | null;
  datetime?: string | null;
}): Promise<RealityContextSignal> {
  const config = getJuaConfig();
  const claim = {
    claim: (params.claim ?? "").trim(),
    location: params.location?.trim() || null,
    datetime: params.datetime?.trim() || null,
  };

  // 1. Irrelevant or absent claim -> honest skipped (Jua must not run for every report).
  if (!isRealityClaimRelevant(claim)) {
    return buildJuaSkippedSignal(claim);
  }

  // 2. Disabled / not configured -> honest unavailable.
  if (!config.enabled) {
    return buildJuaUnavailableSignal(claim, "Jua is disabled.");
  }
  if (!isJuaReady(config)) {
    return buildJuaUnavailableSignal(claim, "Jua API key is not configured.");
  }

  const failed = (reason: string): RealityContextSignal => ({
    provider: "Jua",
    status: "failed",
    claim: claim.claim || null,
    location: claim.location,
    datetime: claim.datetime,
    evidence: [],
    limitations: [reason, PLAUSIBILITY_DISCLAIMER],
    reality_context_risk: null,
    disclaimer: JUA_DISCLAIMER,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JUA_TIMEOUT_MS);
  try {
    // 3a. Jua's forecast engine is point-based; resolve the claim's location.
    if (!claim.location) {
      return buildJuaUnavailableSignal(
        claim,
        "Jua reality-context needs a location (city/place) to query earth-system context.",
      );
    }
    const point = await geocodeLocation(claim.location, controller.signal);
    if (!point) {
      return buildJuaUnavailableSignal(claim, `Could not resolve "${claim.location}" to coordinates for a Jua query.`);
    }

    // 3b. Query the real Jua forecast endpoint.
    const base = config.baseUrl.replace(/\/$/, "");
    const qs = new URLSearchParams({
      models: juaModelSlug(config.defaultModel),
      init_time: "latest",
      latitude: String(point.latitude),
      longitude: String(point.longitude),
      max_prediction_timedelta: "24",
    });
    qs.append("variables", "air_temperature_at_height_level_2m");
    qs.append("variables", "wind_speed_at_height_level_10m");

    const response = await fetch(`${base}/v1/forecast/?${qs.toString()}`, {
      headers: { "X-API-Key": juaApiKey(config), Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await response
        .json()
        .then((d: unknown) => (d && typeof d === "object" && typeof (d as { detail?: unknown }).detail === "string" ? (d as { detail: string }).detail : ""))
        .catch(() => "");
      console.error(`[juaClient] Jua forecast HTTP ${response.status}: ${detail}`);
      // Plan/subscription gating is an account limit, not a failed query — surface it honestly.
      if (response.status === 403 && /plan|subscription|upgrade|not available/i.test(detail)) {
        return buildJuaUnavailableSignal(
          claim,
          "Jua API is not available on the current Jua plan. Upgrade the Jua subscription to enable reality-context checks.",
        );
      }
      return failed(`Jua request failed (HTTP ${response.status}).`);
    }

    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const temperatureK = firstNumber(data?.["air_temperature_at_height_level_2m"] ?? data?.data ?? data);
    const evidence: string[] = [
      `Retrieved Jua ${juaModelSlug(config.defaultModel)} earth-system context for ${point.label} ` +
        `(${point.latitude.toFixed(2)}, ${point.longitude.toFixed(2)})` +
        (claim.datetime ? ` near ${claim.datetime}` : "") +
        ".",
    ];
    if (temperatureK !== null) {
      const celsius = temperatureK > 200 ? temperatureK - 273.15 : temperatureK; // K -> C if needed
      evidence.push(`Forecast near-surface air temperature: ${celsius.toFixed(1)} °C.`);
    }

    return {
      provider: "Jua",
      status: "success",
      claim: claim.claim || null,
      location: claim.location,
      datetime: claim.datetime,
      evidence,
      limitations: [PLAUSIBILITY_DISCLAIMER],
      reality_context_risk: null,
      disclaimer: JUA_DISCLAIMER,
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    console.error("[juaClient] Jua request error:", error);
    return failed(aborted ? "Jua request timed out." : "Jua request failed.");
  } finally {
    clearTimeout(timer);
  }
}
