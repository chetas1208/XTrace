import * as fsPromises from "node:fs/promises";
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

// Resilience knobs. The analyze POST is idempotent (the server only writes an
// ephemeral temp file it deletes), so retrying transient tunnel failures is safe.
const MAX_RETRIES = Math.max(0, Number(process.env.MODEL_SERVER_MAX_RETRIES ?? 2));
const RETRY_BASE_MS = Math.max(100, Number(process.env.MODEL_SERVER_RETRY_BASE_MS ?? 800));
const RETRY_MAX_MS = Math.max(RETRY_BASE_MS, Number(process.env.MODEL_SERVER_RETRY_MAX_MS ?? 6000));

function normalizedBase(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff with jitter, capped. */
function backoffMs(attempt: number): number {
  const exp = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (attempt - 1));
  return Math.round(exp / 2 + Math.random() * (exp / 2));
}

/** Transient HTTP statuses worth retrying for an idempotent request. */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599);
}

/**
 * Build a multipart body part backed by the file on disk (no full in-memory
 * copy) when the runtime supports it; fall back to an in-memory Blob otherwise.
 * This keeps large (e.g. 250 MB) video uploads from exhausting server memory.
 */
async function fileBackedBlob(filePath: string, mimeType: string): Promise<Blob> {
  const openAsBlob = (fsPromises as unknown as { openAsBlob?: (p: string, o?: { type?: string }) => Promise<Blob> })
    .openAsBlob;
  if (typeof openAsBlob === "function") {
    try {
      return await openAsBlob(filePath, { type: mimeType });
    } catch (error) {
      console.error("[modelServerClient] openAsBlob failed, falling back to buffered read:", error);
    }
  }
  const bytes = await readFile(filePath);
  return new Blob([bytes], { type: mimeType });
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
  const mimeType = params.mimeType || "application/octet-stream";
  const totalAttempts = MAX_RETRIES + 1;

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    let response: Response | null = null;
    let networkError: unknown = null;
    try {
      const blob = await fileBackedBlob(params.filePath, mimeType);
      const formData = new FormData();
      formData.append("file", blob, params.fileName);
      response = await fetch(endpoint, {
        method: "POST",
        body: formData,
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (error) {
      networkError = error;
    } finally {
      clearTimeout(timer);
    }

    // Transport-level failure (DNS, reset, timeout abort): retry, then give up.
    if (networkError || !response) {
      const isAbort = networkError instanceof Error && networkError.name === "AbortError";
      const reason = isAbort ? "request timed out" : "connection failed";
      console.error(`[modelServerClient] tunnel POST attempt ${attempt}/${totalAttempts} ${reason}:`, networkError);
      if (attempt < totalAttempts) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new ModelServerUnavailableError();
    }

    // HTTP error: retry transient statuses, surface fatal ones immediately.
    if (!response.ok) {
      const status = response.status;
      const snippet = await response.text().then((t) => t.slice(0, 300)).catch(() => "");
      console.error(`[modelServerClient] tunnel POST attempt ${attempt}/${totalAttempts} HTTP ${status}: ${snippet}`);
      if (isRetryableStatus(status) && attempt < totalAttempts) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new ModelServerUnavailableError();
    }

    // Success path: parse + validate. Contract failures are deterministic — never retried.
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

  // Unreachable in practice (loop either returns or throws), but keeps types happy.
  throw new ModelServerUnavailableError();
}

async function probeRoute(baseUrl: string, route: string, timeoutMs = 8000, retries = 1): Promise<boolean> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${normalizedBase(baseUrl)}${route}`, {
        method: "GET",
        signal: controller.signal,
        cache: "no-store",
      });
      if (response.ok) return true;
      if (!isRetryableStatus(response.status)) return false;
    } catch {
      // transient — fall through to retry
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await sleep(backoffMs(attempt + 1));
  }
  return false;
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
