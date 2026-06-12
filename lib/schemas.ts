import { z } from "zod";

// ---------------------------------------------------------------------------
// Model server response contract (validated on every tunnel round-trip).
// Kept tolerant: unknown extra keys are stripped, raw is coerced to an object.
// ---------------------------------------------------------------------------

export const signalModalitySchema = z.enum(["image", "video", "audio", "provenance", "multimodal"]);
export const signalStatusSchema = z.enum(["success", "failed", "unavailable", "skipped"]);
export const serverMediaTypeSchema = z.enum(["image", "audio", "video", "video_with_audio"]);
export const finalLabelSchema = z.enum([
  "LOW_RISK",
  "UNKNOWN_PROVENANCE",
  "UNKNOWN_PROVENANCE_WITH_SYNTHETIC_RISK",
  "HIGH_SYNTHETIC_MEDIA_RISK",
  "NEEDS_HUMAN_REVIEW",
]);

export const modelSignalSchema = z.object({
  model_name: z.string(),
  modality: signalModalitySchema,
  status: signalStatusSchema,
  score: z.number().nullable(),
  confidence: z.number().nullable(),
  label: z.string().nullable().default(null),
  evidence: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
  raw: z
    .record(z.unknown())
    .nullish()
    .transform((value) => value ?? {}),
  runtime_ms: z.number().default(0),
  device: z.string().default(""),
});

export const fusionResultSchema = z.object({
  risk_score: z.number().nullable(),
  confidence: z.number().nullable(),
  label: finalLabelSchema,
  strongest_evidence: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
});

// --- Sponsor: Guild AI run-ledger trace (optional, from the model server) ---

export const sponsorStatusSchema = z.enum(["success", "unavailable", "failed", "skipped"]);

export const guildArtifactSchema = z.object({
  name: z.string(),
  path: z.string().default(""),
  url: z.string().nullable().default(null),
});

export const guildMetricsSchema = z.object({
  risk_score: z.number().nullable().default(null),
  confidence: z.number().nullable().default(null),
  num_successful_models: z.number().default(0),
  num_failed_models: z.number().default(0),
  runtime_ms: z.number().default(0),
});

export const guildTraceSchema = z.object({
  enabled: z.boolean().default(true),
  status: sponsorStatusSchema.default("success"),
  run_id: z.string().nullable().default(null),
  operation: z.string().default("traceproof_multimodal_analysis"),
  artifacts: z.array(guildArtifactSchema).default([]),
  metrics: guildMetricsSchema.default({
    risk_score: null,
    confidence: null,
    num_successful_models: 0,
    num_failed_models: 0,
    runtime_ms: 0,
  }),
  limitations: z.array(z.string()).default([]),
});

export const sponsorTraceSchema = z.object({
  guild: guildTraceSchema.optional(),
});

export const modelServerAnalysisResponseSchema = z.object({
  request_id: z.string(),
  media_type: serverMediaTypeSchema,
  file_name: z.string(),
  signals: z.array(modelSignalSchema),
  fusion: fusionResultSchema,
  runtime_ms: z.number().default(0),
  sponsor_trace: sponsorTraceSchema.optional(),
});

export type ModelServerAnalysisResponseParsed = z.infer<typeof modelServerAnalysisResponseSchema>;

// ---------------------------------------------------------------------------
// Mapped XTrace report contract (validated before storing / returning).
// ---------------------------------------------------------------------------

export const detectedMediaTypeSchema = z.enum(["image", "audio", "video", "video_with_audio", "unsupported"]);

export const reasoningLayerMetaSchema = z.object({
  provider: z.string().default("Anthropic Claude"),
  model: z.string().nullable().default(null),
  status: z.enum(["success", "fallback_used", "unavailable"]).default("unavailable"),
  note: z.string().default(""),
});

// OpenUI-compatible report block whitelist. Unknown types are dropped.
export const xTraceBlockTypeSchema = z.enum([
  "risk_summary",
  "signal_cluster",
  "limitation",
  "action",
  "sponsor_trace",
  "reality_context",
  "model_readiness",
]);

export const xTraceUIBlockSchema = z.object({
  type: xTraceBlockTypeSchema,
  title: z.string().default(""),
  severity: z.enum(["low", "medium", "high", "neutral"]).default("neutral"),
  content: z.string().default(""),
  items: z.array(z.string()).default([]),
});

export const agentStepSchema = z.object({
  name: z.string(),
  status: z.enum(["success", "failed", "skipped", "unavailable"]),
  description: z.string(),
});

/** Strict schema for the JSON Claude must return. */
export const claudeReasoningSchema = z.object({
  summary: z.string(),
  strongest_evidence: z.array(z.string()).default([]),
  weakest_evidence: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
  human_action: z.string(),
  confidence_rationale: z.string().default(""),
  agent_steps: z.array(agentStepSchema).default([]),
  openui_blocks: z
    .array(z.unknown())
    .default([])
    .transform((blocks) =>
      blocks
        .map((b) => xTraceUIBlockSchema.safeParse(b))
        .filter((r): r is { success: true; data: z.infer<typeof xTraceUIBlockSchema> } => r.success)
        .map((r) => r.data),
    ),
  // Backward-compatible alias
  report_blocks: z
    .array(z.unknown())
    .default([])
    .transform((blocks) =>
      blocks
        .map((b) => xTraceUIBlockSchema.safeParse(b))
        .filter((r): r is { success: true; data: z.infer<typeof xTraceUIBlockSchema> } => r.success)
        .map((r) => r.data),
    ),
});

export const mediaClaimSchema = z.object({
  claim: z.string(),
  location: z.string().nullable().default(null),
  datetime: z.string().nullable().default(null),
});

export const realityContextSchema = z.object({
  provider: z.literal("Jua"),
  status: sponsorStatusSchema,
  claim: z.string(),
  location: z.string().nullable().default(null),
  datetime: z.string().nullable().default(null),
  evidence: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
  reality_context_risk: z.number().nullable().default(null),
  disclaimer: z.string().default("Jua checks weather/location plausibility only. It does not detect deepfakes."),
});

export const feedbackRatingSchema = z.enum([
  "correct",
  "uncertain",
  "wrong",
  "missed_artifact",
  "overconfident",
  "underconfident",
]);

/** Input body for POST /api/feedback. */
export const feedbackInputSchema = z.object({
  jobId: z.string().min(1),
  rating: feedbackRatingSchema,
  comment: z.string().max(4000).optional(),
});

export const modelReadinessSchema = z.object({
  ready: z.boolean(),
  missing: z.array(z.string()).default([]),
  unavailable: z.array(z.string()).default([]),
  failed: z.array(z.string()).default([]),
  loaded: z.array(z.string()).default([]),
  message: z.string(),
  strict_mode: z.boolean().default(true),
});

export const guildWebhookResultSchema = z.object({
  enabled: z.boolean(),
  status: sponsorStatusSchema,
  event_id: z.string().nullable(),
  webhook_url_configured: z.boolean(),
  event_type: z.string(),
  limitations: z.array(z.string()).default([]),
});

export const sponsorStatusesSchema = z.object({
  render: z.object({ enabled: z.boolean(), role: z.string() }),
  guild: z.object({
    enabled: z.boolean(),
    configured: z.boolean(),
    status: sponsorStatusSchema,
    mode: z.string(),
  }),
  composio: z.object({ enabled: z.boolean(), configured: z.boolean() }),
  openui: z.object({ enabled: z.boolean() }),
  jua: z.object({ enabled: z.boolean(), status: sponsorStatusSchema }),
  anthropic: z.object({
    configured: z.boolean(),
    status: z.enum(["success", "fallback_used", "unavailable"]),
  }),
});

/** Safe report fields accepted by Composio action routes from the browser. */
export const actionReportPayloadSchema = z.object({
  file_name: z.string(),
  detected_media_type: detectedMediaTypeSchema,
  final_label: finalLabelSchema,
  risk_score: z.number().nullable(),
  confidence: z.number().nullable(),
  strongest_evidence: z.array(z.string()).default([]),
  weakest_evidence: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
  human_action: z.string(),
  job_id: z.string().optional(),
  request_id: z.string().optional(),
  summary: z.string().optional(),
  signals: z.array(modelSignalSchema).default([]),
  reasoning_layer: reasoningLayerMetaSchema.optional(),
  guild_webhook: guildWebhookResultSchema.nullable().optional(),
  model_readiness: modelReadinessSchema.optional(),
});

/** Input body for POST /api/actions/* — report payload from browser session. */
export const actionInputSchema = z.object({
  report: actionReportPayloadSchema,
});

/** @deprecated jobId-only actions — kept for local dev compatibility. */
export const legacyActionInputSchema = z.object({
  jobId: z.string().min(1),
});

/** Input body for POST /api/reality-context. */
export const realityContextInputSchema = z.object({
  jobId: z.string().min(1),
  claim: z.string().optional(),
  location: z.string().optional(),
  datetime: z.string().optional(),
});

export const traceProofReportSchema = z.object({
  job_id: z.string(),
  request_id: z.string(),
  file_name: z.string(),
  detected_media_type: detectedMediaTypeSchema,
  created_at: z.string(),
  status: z.enum(["completed", "failed"]),
  final_label: finalLabelSchema,
  risk_score: z.number().nullable(),
  confidence: z.number().nullable(),
  summary: z.string(),
  human_action: z.string(),
  signals: z.array(modelSignalSchema),
  strongest_evidence: z.array(z.string()),
  // Backward-compatible defaults so reports written before the reasoning layer
  // (or by an older deploy) still parse.
  weakest_evidence: z.array(z.string()).default([]),
  limitations: z.array(z.string()),
  confidence_rationale: z.string().default(""),
  reasoning_layer: reasoningLayerMetaSchema.default({
    provider: "Anthropic Claude",
    model: null,
    status: "unavailable",
    note: "",
  }),
  report_blocks: z.array(xTraceUIBlockSchema).default([]),
  // Sponsor-layer fields (backward-compatible defaults for older reports).
  guild: guildTraceSchema.nullable().default(null),
  guild_webhook: guildWebhookResultSchema.nullable().default(null),
  model_readiness: modelReadinessSchema.default({
    ready: false,
    missing: [],
    unavailable: [],
    failed: [],
    loaded: [],
    message: "",
    strict_mode: true,
  }),
  sponsor_statuses: sponsorStatusesSchema.default({
    render: { enabled: true, role: "hosts public web agent" },
    guild: { enabled: true, configured: false, status: "unavailable", mode: "webhook" },
    composio: { enabled: true, configured: false },
    openui: { enabled: true },
    jua: { enabled: false, status: "skipped" },
    anthropic: { configured: false, status: "unavailable" },
  }),
  media_claim: mediaClaimSchema.nullable().default(null),
  reality_context: realityContextSchema.nullable().default(null),
  agent_steps: z.array(agentStepSchema).default([]),
  raw_model_response: z.record(z.unknown()),
});

export type TraceProofReportParsed = z.infer<typeof traceProofReportSchema>;
