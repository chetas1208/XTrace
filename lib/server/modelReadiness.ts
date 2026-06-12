import type { ModelReadiness, ModelServerAnalysisResponse, ModelSignal } from "@/types/traceproof";

/**
 * GPU model readiness checks against the HPC model server inventory.
 * Server-side only — never exposes MODEL_SERVER_URL.
 */

export interface ModelReadinessResult {
  ready: boolean;
  missing: string[];
  unavailable: string[];
  failed: string[];
  loaded: string[];
  message: string;
}

function flag(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true" || value === "1";
}

function parseRequiredList(envKey: string): string[] {
  return (process.env[envKey] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

type InventoryEntry = {
  model_name?: string;
  name?: string;
  loaded?: boolean;
  status?: string;
  enabled?: boolean;
  last_error?: string | null;
};

function inventoryEntries(response: unknown): InventoryEntry[] {
  if (Array.isArray(response)) return response as InventoryEntry[];
  if (response && typeof response === "object") {
    const obj = response as Record<string, unknown>;
    if (Array.isArray(obj.models)) return obj.models as InventoryEntry[];
    if (Array.isArray(obj.inventory)) return obj.inventory as InventoryEntry[];
  }
  return [];
}

function entryName(entry: InventoryEntry): string {
  return (entry.model_name ?? entry.name ?? "").trim();
}

function isLoaded(entry: InventoryEntry): boolean {
  if (entry.loaded === true) return true;
  const status = (entry.status ?? "").toLowerCase();
  return status === "loaded" || status === "ready" || status === "success";
}

function isFailed(entry: InventoryEntry): boolean {
  const status = (entry.status ?? "").toLowerCase();
  return status === "failed" || status === "error" || Boolean(entry.last_error);
}

function isUnavailable(entry: InventoryEntry): boolean {
  if (entry.enabled === false) return true;
  const status = (entry.status ?? "").toLowerCase();
  return (
    status === "unavailable" ||
    status === "disabled" ||
    status === "not_loaded" ||
    status === "not loaded" ||
    (!isLoaded(entry) && !isFailed(entry))
  );
}

function findEntry(entries: InventoryEntry[], requiredName: string): InventoryEntry | null {
  const target = normalizeName(requiredName);
  return (
    entries.find((e) => {
      const name = normalizeName(entryName(e));
      return name === target || name.includes(target) || target.includes(name);
    }) ?? null
  );
}

function requiredForMediaType(mediaType?: string): string[] {
  const image = parseRequiredList("REQUIRED_IMAGE_MODELS");
  const audio = parseRequiredList("REQUIRED_AUDIO_MODELS");
  const video = parseRequiredList("REQUIRED_VIDEO_MODELS");
  const provenance = parseRequiredList("REQUIRED_PROVENANCE_MODELS");

  if (!mediaType) {
    return [...new Set([...image.slice(0, 1), ...audio.slice(0, 1), ...video.slice(0, 1), ...provenance])];
  }

  if (mediaType === "image") return image;
  if (mediaType === "audio") return audio;
  if (mediaType === "video" || mediaType === "video_with_audio") {
    return mediaType === "video_with_audio" ? [...video, ...audio] : video;
  }
  return [];
}

function classifyRequired(entries: InventoryEntry[], requiredNames: string[]): ModelReadinessResult {
  const missing: string[] = [];
  const unavailable: string[] = [];
  const failed: string[] = [];
  const loaded: string[] = [];

  for (const name of requiredNames) {
    const entry = findEntry(entries, name);
    if (!entry) {
      missing.push(name);
      continue;
    }
    if (isLoaded(entry)) {
      loaded.push(name);
    } else if (isFailed(entry)) {
      failed.push(name);
    } else if (isUnavailable(entry)) {
      unavailable.push(name);
    } else {
      unavailable.push(name);
    }
  }

  const strict = flag(process.env.REQUIRED_MODELS_STRICT, true);
  const ready = strict ? loaded.length > 0 && missing.length === 0 && failed.length === 0 && unavailable.length === 0 : loaded.length > 0;

  let message = "Required GPU models are ready.";
  if (!ready) {
    if (missing.length) message = `Missing required models: ${missing.join(", ")}.`;
    else if (failed.length) message = `Failed required models: ${failed.join(", ")}.`;
    else if (unavailable.length) message = `Unavailable required models: ${unavailable.join(", ")}.`;
    else message = "Required GPU models are not ready.";
  }

  return { ready, missing, unavailable, failed, loaded, message };
}

export function checkRequiredModelReadiness(params: {
  modelServerModelsResponse: unknown;
  detectedMediaType?: string;
}): ModelReadinessResult {
  const entries = inventoryEntries(params.modelServerModelsResponse);
  const required = requiredForMediaType(params.detectedMediaType);
  return classifyRequired(entries, required);
}

function signalMatchesRequired(signal: ModelSignal, requiredName: string): boolean {
  const a = normalizeName(signal.model_name);
  const b = normalizeName(requiredName);
  return a === b || a.includes(b) || b.includes(a);
}

/** After analysis, verify required models returned real successful signals (strict mode). */
export function validatePostAnalysisModelPolicy(params: {
  response: ModelServerAnalysisResponse;
  preReadiness: ModelReadinessResult;
}): ModelReadinessResult {
  const strict = flag(process.env.REQUIRED_MODELS_STRICT, true);
  const mediaType = params.response.media_type;
  const required = requiredForMediaType(mediaType);

  const missing: string[] = [];
  const unavailable: string[] = [];
  const failed: string[] = [];
  const loaded: string[] = [];

  for (const name of required) {
    const signal = params.response.signals.find((s) => signalMatchesRequired(s, name));
    if (!signal) {
      missing.push(name);
      continue;
    }
    if (signal.status === "success") {
      loaded.push(name);
    } else if (signal.status === "failed") {
      failed.push(name);
    } else {
      unavailable.push(name);
    }
  }

  // Provenance: show but don't block unless strict provenance env is set
  const provenanceRequired = parseRequiredList("REQUIRED_PROVENANCE_MODELS");
  const provenanceStrict = flag(process.env.REQUIRED_PROVENANCE_STRICT, false);
  if (provenanceStrict) {
    for (const name of provenanceRequired) {
      const signal = params.response.signals.find((s) => signalMatchesRequired(s, name));
      if (!signal || signal.status !== "success") {
        if (!signal) missing.push(name);
        else if (signal.status === "failed") failed.push(name);
        else unavailable.push(name);
      } else {
        loaded.push(name);
      }
    }
  }

  const modalityReady = (modality: "image" | "audio" | "video"): boolean => {
    const successSignals = params.response.signals.filter(
      (s) => s.status === "success" && (s.modality === modality || (modality === "video" && s.modality === "multimodal")),
    );
    return successSignals.length > 0;
  };

  let ready = params.preReadiness.ready;
  if (strict) {
    if (mediaType === "image") ready = modalityReady("image");
    else if (mediaType === "audio") ready = modalityReady("audio");
    else if (mediaType === "video") ready = modalityReady("video");
    else if (mediaType === "video_with_audio") ready = modalityReady("video") && modalityReady("audio");
    if (missing.length || failed.length || unavailable.length) ready = false;
  }

  let message = ready ? "Analysis returned required model-backed signals." : "Required GPU models are not ready. No fallback scores were used.";
  if (!ready && (missing.length || failed.length || unavailable.length)) {
    const parts: string[] = [];
    if (missing.length) parts.push(`missing: ${missing.join(", ")}`);
    if (failed.length) parts.push(`failed: ${failed.join(", ")}`);
    if (unavailable.length) parts.push(`unavailable: ${unavailable.join(", ")}`);
    message = `Required GPU models are not ready (${parts.join("; ")}). No fallback scores were used.`;
  }

  return { ready, missing, unavailable, failed, loaded, message };
}

export function toModelReadiness(result: ModelReadinessResult): ModelReadiness {
  return {
    ready: result.ready,
    missing: result.missing,
    unavailable: result.unavailable,
    failed: result.failed,
    loaded: result.loaded,
    message: result.message,
    strict_mode: flag(process.env.REQUIRED_MODELS_STRICT, true),
  };
}
