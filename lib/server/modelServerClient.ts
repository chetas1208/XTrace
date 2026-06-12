import { readFile } from "node:fs/promises";
import { modelServerAnalysisResponseSchema } from "@/lib/schemas";
import type { ModelServerAnalysisResponse } from "@/types/traceproof";

/**
 * Server-side client for the private GPU model server reached through the
 * Cloudflare tunnel. This module must NEVER run in the browser, and no error
 * it raises may contain the tunnel URL.
 */

export class ModelServerConfigError extends Error {
  constructor(message = "Model server URL is not configured.") {
    super(message);
    this.name = "ModelServerConfigError";
  }
}

export class ModelServerUnavailableError extends Error {
  constructor(message = "GPU model server is unavailable through tunnel.") {
    super(message);
    this.name = "ModelServerUnavailableError";
  }
}

export class ModelServerResponseError extends Error {
  constructor(message = "The GPU model server returned an unreadable response.") {
    super(message);
    this.name = "ModelServerResponseError";
  }
}

const DEFAULT_TIMEOUT_MS = Number(process.env.MODEL_SERVER_TIMEOUT_MS ?? 10 * 60 * 1000);
const MULTIMODAL_ROUTE = process.env.MODEL_SERVER_MULTIMODAL_ROUTE ?? "/v1/analyze/multimodal";
const HEALTH_ROUTE = process.env.MODEL_SERVER_HEALTH_ROUTE ?? "/health";
const MODELS_ROUTE = process.env.MODEL_SERVER_MODELS_ROUTE ?? "/models";
const MODEL_INVENTORY_ROUTE = "/model-inventory";

function normalizedBase(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

export async function analyzeMediaViaTunnel(params: {
  filePath: string;
  fileName: string;
  mimeType: string;
}): Promise<ModelServerAnalysisResponse> {
  if (typeof window !== "undefined") {
    throw new Error("analyzeMediaViaTunnel must only run on the server.");
  }

  const baseUrl = process.env.MODEL_SERVER_URL;
  if (!baseUrl) {
    throw new ModelServerConfigError();
  }

  const endpoint = `${normalizedBase(baseUrl)}${MULTIMODAL_ROUTE}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    const bytes = await readFile(params.filePath);
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([bytes], { type: params.mimeType || "application/octet-stream" }),
      params.fileName,
    );

    response = await fetch(endpoint, {
      method: "POST",
      body: formData,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    // Network failure, DNS failure, or timeout abort. Do not leak the URL.
    const reason = error instanceof Error && error.name === "AbortError" ? "request timed out" : "connection failed";
    console.error(`[modelServerClient] tunnel request ${reason}:`, error);
    throw new ModelServerUnavailableError();
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    console.error(`[modelServerClient] model server responded HTTP ${response.status}`);
    throw new ModelServerUnavailableError();
  }

  let rawJson: unknown;
  try {
    rawJson = await response.json();
  } catch (error) {
    console.error("[modelServerClient] failed to parse JSON from model server:", error);
    throw new ModelServerResponseError();
  }

  const parsed = modelServerAnalysisResponseSchema.safeParse(rawJson);
  if (!parsed.success) {
    console.error("[modelServerClient] model server response failed schema validation:", parsed.error.flatten());
    throw new ModelServerResponseError("The model server response did not match the expected contract.");
  }

  return parsed.data as ModelServerAnalysisResponse;
}

async function probeRoute(baseUrl: string, route: string, timeoutMs = 8000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${normalizedBase(baseUrl)}${route}`, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Server-side health probe used by /api/model-server-health and
 * /api/system-status. Never throws and never leaks the URL.
 */
export async function probeModelServerHealth(): Promise<{
  available: boolean;
  status: string;
  models_route_ok: boolean;
}> {
  const baseUrl = process.env.MODEL_SERVER_URL;
  if (!baseUrl) {
    return { available: false, status: "not_configured", models_route_ok: false };
  }

  const healthOk = await probeRoute(baseUrl, HEALTH_ROUTE);
  if (!healthOk) {
    return { available: false, status: "unreachable", models_route_ok: false };
  }
  const modelsOk = await probeRoute(baseUrl, MODELS_ROUTE);
  return { available: true, status: "healthy", models_route_ok: modelsOk };
}

/** Fetch model inventory from /models or /model-inventory. Never throws; never leaks URL. */
export async function fetchModelServerModels(): Promise<{ ok: boolean; data: unknown }> {
  const baseUrl = process.env.MODEL_SERVER_URL;
  if (!baseUrl) return { ok: false, data: null };

  for (const route of [MODELS_ROUTE, MODEL_INVENTORY_ROUTE]) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`${normalizedBase(baseUrl)}${route}`, {
        method: "GET",
        signal: controller.signal,
        cache: "no-store",
      });
      if (response.ok) {
        const data = await response.json().catch(() => null);
        if (data !== null) return { ok: true, data };
      }
    } catch {
      // try next route
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, data: null };
}

/** Map any model-server error to a user-safe message (never contains the URL). */
export function userFacingModelServerError(error: unknown): string {
  if (error instanceof ModelServerConfigError) return "Model server URL is not configured.";
  if (error instanceof ModelServerUnavailableError) return "GPU model server is unavailable through tunnel.";
  if (error instanceof ModelServerResponseError) return error.message;
  return "Analysis could not be completed.";
}
