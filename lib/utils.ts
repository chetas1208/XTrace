import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { DetectedMediaType, FinalLabel, SignalStatus } from "@/types/traceproof";

// ---------------------------------------------------------------------------
// Supported formats (single source of truth, browser-safe).
// mediaDetection.ts (server) imports these to add magic-number/ffprobe checks.
// ---------------------------------------------------------------------------

export const SUPPORTED_FORMATS = {
  image: {
    ext: ["jpg", "jpeg", "png", "webp"],
    mime: ["image/jpeg", "image/png", "image/webp"],
  },
  audio: {
    ext: ["wav", "mp3", "m4a"],
    mime: ["audio/wav", "audio/x-wav", "audio/wave", "audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "audio/m4a", "audio/aac"],
  },
  video: {
    ext: ["mp4", "mov", "webm"],
    mime: ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"],
  },
} as const;

export const ACCEPT_ATTR = ".jpg,.jpeg,.png,.webp,.mp4,.mov,.webm,.wav,.mp3,.m4a";

export const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;

export const UNSUPPORTED_FILE_MESSAGE =
  "Unsupported file type. Upload JPG, PNG, WEBP, MP4, MOV, WEBM, WAV, MP3, or M4A.";

export function extensionOf(fileName: string): string {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

export function baseFromExtension(fileName: string): "image" | "audio" | "video" | null {
  const ext = extensionOf(fileName);
  if (SUPPORTED_FORMATS.image.ext.includes(ext as never)) return "image";
  if (SUPPORTED_FORMATS.audio.ext.includes(ext as never)) return "audio";
  if (SUPPORTED_FORMATS.video.ext.includes(ext as never)) return "video";
  return null;
}

export function baseFromMime(mimeType: string | undefined | null): "image" | "audio" | "video" | null {
  if (!mimeType) return null;
  const value = mimeType.toLowerCase().split(";")[0].trim();
  if (SUPPORTED_FORMATS.image.mime.includes(value as never) || value.startsWith("image/")) return "image";
  if (SUPPORTED_FORMATS.audio.mime.includes(value as never) || value.startsWith("audio/")) return "audio";
  if (SUPPORTED_FORMATS.video.mime.includes(value as never) || value.startsWith("video/")) return "video";
  return null;
}

/**
 * Browser-side best-effort detection used purely for upload UX (preview +
 * detected-type badge). The server re-detects authoritatively. Returns one of
 * the base types or "unsupported"; the video_with_audio distinction is decided
 * by the model server, never the browser.
 */
export function detectMediaTypeClient(file: File): DetectedMediaType {
  const base = baseFromMime(file.type) ?? baseFromExtension(file.name);
  return base ?? "unsupported";
}

// ---------------------------------------------------------------------------
// Class merge
// ---------------------------------------------------------------------------

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// ---------------------------------------------------------------------------
// Formatting (null-safe — model scores can legitimately be null)
// ---------------------------------------------------------------------------

/** Fusion risk score is 0-100. */
export function formatRiskScore(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "N/A";
  return `${Math.round(value)}`;
}

/** Confidence is a 0-1 probability. */
export function formatConfidence(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "N/A";
  return `${Math.round(clamp(value, 0, 1) * 100)}%`;
}

/** Per-signal score is typically a 0-1 probability. */
export function formatSignalScore(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "N/A";
  return value.toFixed(3);
}

export function signalScorePercent(value: number | null): number {
  if (value === null || Number.isNaN(value)) return 0;
  // Signal scores are 0-1 probabilities; clamp into a 0-100 bar width.
  return Math.round(clamp(value, 0, 1) * 100);
}

export function formatRuntime(ms: number): string {
  if (!Number.isFinite(ms)) return "N/A";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

// ---------------------------------------------------------------------------
// Labels and media-type display
// ---------------------------------------------------------------------------

export function labelToDisplay(label: FinalLabel): string {
  return label
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function labelClassName(label: FinalLabel): string {
  if (label === "LOW_RISK") return "border-green-verified/40 bg-green-verified/10 text-green-verified";
  if (label === "HIGH_SYNTHETIC_MEDIA_RISK") return "border-red-risk/45 bg-red-risk/10 text-red-risk";
  if (label === "UNKNOWN_PROVENANCE_WITH_SYNTHETIC_RISK") return "border-amber-risk/45 bg-amber-risk/10 text-amber-risk";
  if (label === "NEEDS_HUMAN_REVIEW") return "border-amber-risk/45 bg-amber-risk/10 text-amber-risk";
  return "border-cyan-signal/35 bg-cyan-signal/10 text-cyan-signal";
}

export function riskColor(value: number | null): string {
  if (value === null) return "#a8b3c7";
  if (value > 75) return "#ff5f6d";
  if (value > 50) return "#f7b955";
  return "#61d394";
}

export function readableMediaType(mediaType: DetectedMediaType): string {
  if (mediaType === "video_with_audio") return "Video with audio";
  if (mediaType === "unsupported") return "Unsupported";
  return mediaType.charAt(0).toUpperCase() + mediaType.slice(1);
}

/** Reduce any detected type to a base bucket for preview rendering. */
export function previewBucket(mediaType: DetectedMediaType): "image" | "audio" | "video" | null {
  if (mediaType === "image") return "image";
  if (mediaType === "audio") return "audio";
  if (mediaType === "video" || mediaType === "video_with_audio") return "video";
  return null;
}

// ---------------------------------------------------------------------------
// Signal status presentation
// ---------------------------------------------------------------------------

export function signalStatusClassName(status: SignalStatus): string {
  if (status === "success") return "border-green-verified/40 bg-green-verified/10 text-green-verified";
  if (status === "failed") return "border-red-risk/45 bg-red-risk/10 text-red-risk";
  if (status === "unavailable") return "border-amber-risk/40 bg-amber-risk/10 text-amber-risk";
  // skipped
  return "border-border bg-panel-soft text-text-secondary";
}

export function signalBarColor(status: SignalStatus): string {
  if (status === "success") return "#39d0ff";
  if (status === "failed") return "#ff5f6d";
  if (status === "unavailable") return "#f7b955";
  return "#475569";
}
