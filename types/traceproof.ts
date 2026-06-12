// Core domain types for XTrace.
//
// These types are shared between server and browser code, so this module must
// stay free of any Node-only imports.

/** Media types the local detector can resolve before the model server runs. */
export type DetectedMediaType = "image" | "audio" | "video" | "video_with_audio" | "unsupported";

/** Media type as reported authoritatively by the GPU model server. */
export type ServerMediaType = "image" | "audio" | "video" | "video_with_audio";

/** Modality of an individual model signal. */
export type SignalModality = "image" | "video" | "audio" | "provenance" | "multimodal";

/** Per-signal status. Unavailable/failed/skipped are surfaced, never hidden. */
export type SignalStatus = "success" | "failed" | "unavailable" | "skipped";

/** Fusion / final risk label. Never a binary "fake"/"real" verdict. */
export type FinalLabel =
  | "LOW_RISK"
  | "UNKNOWN_PROVENANCE"
  | "UNKNOWN_PROVENANCE_WITH_SYNTHETIC_RISK"
  | "HIGH_SYNTHETIC_MEDIA_RISK"
  | "NEEDS_HUMAN_REVIEW";

/** Lifecycle of an analysis job in the job store. */
export type JobStatus = "created" | "running" | "completed" | "failed";

/** Status of the Anthropic Claude reasoning (report-writing) layer. */
export type ReasoningLayerStatus = "success" | "fallback_used" | "unavailable";

/** Metadata about how the report's narrative text was produced. */
export interface ReasoningLayerMeta {
  provider: string;
  model: string | null;
  status: ReasoningLayerStatus;
  note: string;
}

/** Whitelisted OpenUI-compatible report block types. */
export type XTraceBlockType =
  | "risk_summary"
  | "signal_cluster"
  | "limitation"
  | "action"
  | "sponsor_trace"
  | "reality_context"
  | "model_readiness";

export type XTraceBlockSeverity = "low" | "medium" | "high" | "neutral";

/**
 * A dynamic, OpenUI-compatible report block. Claude may emit these in a strict
 * schema; the renderer maps each to a safe React component (no raw HTML, no
 * arbitrary code), ignoring any unknown block type.
 */
export interface XTraceUIBlock {
  type: XTraceBlockType;
  title: string;
  severity: XTraceBlockSeverity;
  content: string;
  items: string[];
}

/** Agent pipeline step emitted by Claude (display only). */
export interface AgentStep {
  name: string;
  status: "success" | "failed" | "skipped" | "unavailable";
  description: string;
}

/** GPU model readiness snapshot attached to every report. */
export interface ModelReadiness {
  ready: boolean;
  missing: string[];
  unavailable: string[];
  failed: string[];
  loaded: string[];
  message: string;
  strict_mode: boolean;
}

/** Guild webhook delivery result (no secrets). */
export interface GuildWebhookResult {
  enabled: boolean;
  status: SponsorStatus;
  event_id: string | null;
  webhook_url_configured: boolean;
  event_type: string;
  limitations: string[];
}

/** Sponsor tool statuses for trace/webhook payloads. */
export interface SponsorStatuses {
  render: { enabled: boolean; role: string };
  guild: { enabled: boolean; configured: boolean; status: SponsorStatus; mode: string };
  composio: { enabled: boolean; configured: boolean };
  openui: { enabled: boolean };
  jua: { enabled: boolean; status: SponsorStatus };
  anthropic: { configured: boolean; status: ReasoningLayerStatus };
}

/** Jua reality context (alias for clarity in server modules). */
export type JuaRealityContext = RealityContextSignal;

/**
 * Claude forensic summary JSON contract.
 * `openui_blocks` mirrors `report_blocks` for the OpenUI renderer.
 */
export interface ClaudeXTraceSummary {
  summary: string;
  strongest_evidence: string[];
  weakest_evidence: string[];
  limitations: string[];
  human_action: string;
  confidence_rationale: string;
  agent_steps: AgentStep[];
  openui_blocks: XTraceUIBlock[];
  report_blocks: XTraceUIBlock[];
  reasoning_layer: ReasoningLayerMeta;
}

/**
 * Narrative fields produced by the Anthropic Claude reasoning layer (or by the
 * deterministic fallback). These are TEXT ONLY: they never include or alter
 * detector scores, the fusion risk_score/confidence/label, or model signals.
 */
export interface ReasoningSummary {
  summary: string;
  strongest_evidence: string[];
  weakest_evidence: string[];
  limitations: string[];
  human_action: string;
  confidence_rationale: string;
  report_blocks: XTraceUIBlock[];
  agent_steps?: AgentStep[];
  reasoning_layer: ReasoningLayerMeta;
}

/** A single model-backed signal returned by the GPU model server. */
export interface ModelSignal {
  model_name: string;
  modality: SignalModality;
  status: SignalStatus;
  score: number | null;
  confidence: number | null;
  label: string | null;
  evidence: string[];
  limitations: string[];
  raw: Record<string, unknown>;
  runtime_ms: number;
  device: string;
}

/** Fused decision across all signals. */
export interface FusionResult {
  risk_score: number | null;
  confidence: number | null;
  label: FinalLabel;
  strongest_evidence: string[];
  limitations: string[];
}

// ---------------------------------------------------------------------------
// Sponsor-tool layer (Render, Guild, Composio, Jua, OpenUI).
//
// Every sponsor integration maps to a real production function. Sponsor calls
// are server-side only; nothing here ever exposes an API key or the tunnel URL.
// "unavailable" / "skipped" / "failed" are always surfaced honestly — sponsor
// outputs are never invented.
// ---------------------------------------------------------------------------

/** Common status used across all sponsor integrations. */
export type SponsorStatus = "success" | "unavailable" | "failed" | "skipped";

/** Guild AI — forensic run ledger artifact. */
export interface GuildArtifact {
  name: string;
  path: string;
  url: string | null;
}

/** Guild AI — reproducible-run metrics. */
export interface GuildMetrics {
  risk_score: number | null;
  confidence: number | null;
  num_successful_models: number;
  num_failed_models: number;
  runtime_ms: number;
}

/** Guild AI — forensic run ledger trace, produced by the HPC model server. */
export interface GuildTrace {
  enabled: boolean;
  status: SponsorStatus;
  run_id: string | null;
  operation: string;
  artifacts: GuildArtifact[];
  metrics: GuildMetrics;
  limitations: string[];
}

/** Optional sponsor metadata the HPC model server may attach to its response. */
export interface SponsorTrace {
  guild?: GuildTrace;
}

/** A user-provided claim about the media (drives the optional Jua check). */
export interface MediaClaim {
  claim: string;
  location: string | null;
  datetime: string | null;
}

/** Jua — reality-context (weather/location/time plausibility) signal. */
export interface RealityContextSignal {
  provider: "Jua";
  status: SponsorStatus;
  claim: string;
  location: string | null;
  datetime: string | null;
  evidence: string[];
  limitations: string[];
  reality_context_risk: number | null;
  disclaimer: string;
}

/** Local reviewer feedback rating vocabulary. */
export type FeedbackRating =
  | "correct"
  | "uncertain"
  | "wrong"
  | "missed_artifact"
  | "overconfident"
  | "underconfident";

/** A locally stored reviewer feedback record (local review panel). */
export interface FeedbackRecord {
  rating: FeedbackRating;
  comment: string | null;
  timestamp: string;
}

/** Composio — action type and recorded result. */
export type ComposioActionType = "github_issue" | "slack" | "notion";

export interface ComposioActionResult {
  action: ComposioActionType;
  status: SponsorStatus;
  message: string;
  url: string | null;
  timestamp: string;
}

/** The exact contract the FastAPI model server returns from /v1/analyze/*. */
export interface ModelServerAnalysisResponse {
  request_id: string;
  media_type: ServerMediaType;
  file_name: string;
  signals: ModelSignal[];
  fusion: FusionResult;
  runtime_ms: number;
  /** Optional sponsor metadata (e.g. Guild run ledger). Absent on most runs. */
  sponsor_trace?: SponsorTrace;
}

/** The report the hosted Next.js app renders, mapped from the model response. */
export interface TraceProofReport {
  job_id: string;
  request_id: string;
  file_name: string;
  detected_media_type: DetectedMediaType;
  created_at: string;
  status: "completed" | "failed";
  final_label: FinalLabel;
  risk_score: number | null;
  confidence: number | null;
  summary: string;
  human_action: string;
  signals: ModelSignal[];
  strongest_evidence: string[];
  weakest_evidence: string[];
  limitations: string[];
  confidence_rationale: string;
  reasoning_layer: ReasoningLayerMeta;
  // OpenUI-compatible dynamic report blocks (Claude-authored or deterministic).
  report_blocks: XTraceUIBlock[];
  // Sponsor-layer fields. guild comes from the model server (or null when the
  // run ledger is unavailable); media_claim is captured at upload; reality_context
  // is populated only when Jua runs against a weather/location/time claim.
  guild: GuildTrace | null;
  guild_webhook: GuildWebhookResult | null;
  model_readiness: ModelReadiness;
  sponsor_statuses: SponsorStatuses;
  media_claim: MediaClaim | null;
  reality_context: RealityContextSignal | null;
  agent_steps: AgentStep[];
  raw_model_response: Record<string, unknown>;
}

/** Primary report type (XTrace naming). */
export type XTraceReport = TraceProofReport;

/** Response body for POST /api/analyze — returns the complete report. */
export interface AnalyzeResponse {
  status: "completed" | "failed";
  report?: TraceProofReport;
  error?: string;
  model_readiness?: ModelReadiness;
}

/** @deprecated Use AnalyzeResponse — kept for backward compatibility. */
export interface AnalyzeJobResponse {
  jobId: string;
  status: "completed" | "failed";
}

/** Internal job record kept in the job store. */
export interface StoredJob {
  jobId: string;
  status: JobStatus;
  fileName: string;
  filePath: string;
  mimeType: string;
  detectedMediaType: DetectedMediaType;
  createdAt: string;
  updatedAt: string;
  report: TraceProofReport | null;
  failureMessage: string | null;
  errors: string[];
  // Sponsor-layer job state (post-report actions/feedback).
  mediaClaim: MediaClaim | null;
  feedback: FeedbackRecord[];
  actions: ComposioActionResult[];
}

/** Response body for GET /api/jobs/[jobId]. */
export interface JobEnvelope {
  job_id: string;
  status: JobStatus;
  file_name: string;
  detected_media_type: DetectedMediaType;
  created_at: string;
  updated_at: string;
  failure_message: string | null;
  errors: string[];
  report: TraceProofReport | null;
  feedback: FeedbackRecord[];
  actions: ComposioActionResult[];
}
