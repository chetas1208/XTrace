import type {
  AgentStep,
  DetectedMediaType,
  FinalLabel,
  GuildTrace,
  MediaClaim,
  ModelReadiness,
  ModelServerAnalysisResponse,
  RealityContextSignal,
  ReasoningSummary,
  TraceProofReport,
  XTraceBlockSeverity,
  XTraceUIBlock,
} from "@/types/traceproof";

// ---------------------------------------------------------------------------
// Deterministic, evidence-grounded text generation.
//
// Rules (from the spec):
//  - Do not alter scores.
//  - Do not invent evidence.
//  - Build narrative text deterministically from strongest_evidence and
//    limitations ONLY when the reasoning layer is unavailable.
//  - Never use "this is fake" / "this is real" / "detected with certainty".
//
// The reasoning layer (Anthropic Claude) may replace these TEXT fields, but it
// never touches detector scores, the fusion risk_score/confidence/label, or
// signals.
// ---------------------------------------------------------------------------

const LABEL_LEAD: Record<FinalLabel, string> = {
  LOW_RISK:
    "Model-backed signals show limited synthetic-media risk indicators for this file. This is not a definitive determination.",
  UNKNOWN_PROVENANCE:
    "The provenance of this file is unknown and model-backed signals are inconclusive. This is not definitive.",
  UNKNOWN_PROVENANCE_WITH_SYNTHETIC_RISK:
    "The provenance of this file is unknown and some model-backed signals indicate synthetic-media risk. Confidence is limited.",
  HIGH_SYNTHETIC_MEDIA_RISK:
    "Multiple model-backed signals indicate elevated synthetic-media risk. This is not a definitive determination and requires human review.",
  NEEDS_HUMAN_REVIEW:
    "Model-backed signals are conflicting or insufficient for an automated assessment. This file requires human review.",
};

const HUMAN_ACTION: Record<FinalLabel, string> = {
  LOW_RISK:
    "No urgent action is required. For high-stakes use, still verify the original source and request signed provenance (such as C2PA) before relying on this file.",
  UNKNOWN_PROVENANCE:
    "Request the original source file and signed provenance metadata. Treat this file as unverified until it is independently corroborated.",
  UNKNOWN_PROVENANCE_WITH_SYNTHETIC_RISK:
    "Escalate for human review. Request the original source and provenance, and corroborate with independent evidence before using this file.",
  HIGH_SYNTHETIC_MEDIA_RISK:
    "Do not rely on this file as authentic evidence. Escalate to a human reviewer and seek independent corroboration and signed provenance.",
  NEEDS_HUMAN_REVIEW:
    "Route this file to a human analyst. The available model-backed signals are insufficient for an automated assessment.",
};

export function dedupe(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function buildSummary(label: FinalLabel, strongestEvidence: string[], limitations: string[]): string {
  const parts: string[] = [LABEL_LEAD[label]];
  const evidence = strongestEvidence.filter(Boolean);
  if (evidence.length > 0) parts.push(`Strongest model-backed signals: ${evidence.slice(0, 4).join("; ")}.`);
  const limits = limitations.filter(Boolean);
  if (limits.length > 0) parts.push(`Key limitations: ${limits.slice(0, 4).join("; ")}.`);
  if (evidence.length === 0 && limits.length === 0) {
    parts.push("Review the individual model signal cards below for the underlying evidence.");
  }
  return parts.join(" ");
}

function severityForLabel(label: FinalLabel): XTraceBlockSeverity {
  if (label === "HIGH_SYNTHETIC_MEDIA_RISK") return "high";
  if (label === "UNKNOWN_PROVENANCE_WITH_SYNTHETIC_RISK" || label === "NEEDS_HUMAN_REVIEW") return "medium";
  if (label === "LOW_RISK") return "low";
  return "neutral";
}

/** Deterministic OpenUI report blocks built only from real evidence. */
export function buildDeterministicBlocks(
  response: ModelServerAnalysisResponse,
  strongest: string[],
  weakest: string[],
  limitations: string[],
  humanAction: string,
): XTraceUIBlock[] {
  const blocks: XTraceUIBlock[] = [];
  blocks.push({
    type: "risk_summary",
    title: "Provenance-risk summary",
    severity: severityForLabel(response.fusion.label),
    content: LABEL_LEAD[response.fusion.label],
    items: [],
  });
  if (strongest.length > 0) {
    blocks.push({
      type: "signal_cluster",
      title: "Strongest model-backed signals",
      severity: "neutral",
      content: "Signals that contributed most to the fused assessment.",
      items: strongest.slice(0, 6),
    });
  }
  if (limitations.length > 0) {
    blocks.push({
      type: "limitation",
      title: "Limitations",
      severity: "medium",
      content: "Detector uncertainty and unavailable signals are preserved.",
      items: limitations.slice(0, 8),
    });
  }
  blocks.push({
    type: "action",
    title: "Recommended human action",
    severity: severityForLabel(response.fusion.label),
    content: humanAction,
    items: [],
  });
  // `weakest` informs the limitations cluster; surface it too when present.
  if (weakest.length > 0) {
    blocks.push({
      type: "signal_cluster",
      title: "Weakest / unavailable signals",
      severity: "low",
      content: "Signals that were unavailable, failed, or skipped.",
      items: weakest.slice(0, 6),
    });
  }
  return blocks;
}

/**
 * Deterministic narrative built ONLY from the model server's own evidence.
 * Used as the resilient fallback when the Claude reasoning layer is
 * unavailable, and as the safety net unioned into the reasoning-layer output.
 */
export function buildDeterministicReasoning(
  response: ModelServerAnalysisResponse,
): Omit<ReasoningSummary, "reasoning_layer"> {
  const label = response.fusion.label;
  const strongest = response.fusion.strongest_evidence.filter(Boolean);
  const limitations = dedupe([
    ...response.fusion.limitations,
    ...response.signals.flatMap((signal) => signal.limitations),
  ]);

  const degraded = response.signals.filter((s) => s.status !== "success");
  const weakest = degraded.map((s) => {
    const reason = s.limitations[0] ? ` — ${s.limitations[0]}` : "";
    return `${s.model_name}: ${s.status}${reason}`;
  });

  const successCount = response.signals.length - degraded.length;
  const confidencePct =
    response.fusion.confidence === null ? "unavailable" : `${Math.round(response.fusion.confidence * 100)}%`;
  const confidenceRationale =
    `Fused confidence ${confidencePct} reflects ${successCount} successful model-backed signal(s) and ` +
    `${degraded.length} unavailable/failed/skipped signal(s) out of ${response.signals.length}. ` +
    `Detector uncertainty is preserved; this is not a definitive determination.`;

  const humanAction = HUMAN_ACTION[label];

  return {
    summary: buildSummary(label, strongest, limitations),
    strongest_evidence: strongest,
    weakest_evidence: weakest,
    limitations,
    human_action: humanAction,
    confidence_rationale: confidenceRationale,
    report_blocks: buildDeterministicBlocks(response, strongest, weakest, limitations, humanAction),
  };
}

export function mapAnalysisResponseToReport(params: {
  jobId: string;
  createdAt: string;
  detectedMediaType: DetectedMediaType;
  response: ModelServerAnalysisResponse;
  reasoning: ReasoningSummary & { agent_steps?: AgentStep[] };
  guild?: GuildTrace | null;
  mediaClaim?: MediaClaim | null;
  modelReadiness: ModelReadiness;
  realityContext?: RealityContextSignal | null;
  agentSteps?: AgentStep[];
}): TraceProofReport {
  const { jobId, createdAt, detectedMediaType, response, reasoning } = params;

  const reportedMediaType: DetectedMediaType = response.media_type ?? detectedMediaType;

  return {
    job_id: jobId,
    request_id: response.request_id,
    file_name: response.file_name,
    detected_media_type: reportedMediaType,
    created_at: createdAt,
    status: "completed",
    final_label: response.fusion.label,
    risk_score: response.fusion.risk_score,
    confidence: response.fusion.confidence,
    signals: response.signals,
    raw_model_response: response as unknown as Record<string, unknown>,
    summary: reasoning.summary,
    human_action: reasoning.human_action,
    strongest_evidence: reasoning.strongest_evidence,
    weakest_evidence: reasoning.weakest_evidence,
    limitations: reasoning.limitations,
    confidence_rationale: reasoning.confidence_rationale,
    reasoning_layer: reasoning.reasoning_layer,
    report_blocks: reasoning.report_blocks,
    agent_steps: params.agentSteps ?? reasoning.agent_steps ?? [],
    guild: params.guild ?? null,
    guild_webhook: null,
    model_readiness: params.modelReadiness,
    sponsor_statuses: {
      render: { enabled: true, role: "hosts public web agent" },
      guild: { enabled: true, configured: false, status: "unavailable", mode: "webhook" },
      composio: { enabled: true, configured: false },
      openui: { enabled: true },
      jua: { enabled: false, status: "skipped" },
      anthropic: { configured: false, status: "unavailable" },
    },
    media_claim: params.mediaClaim ?? null,
    reality_context: params.realityContext ?? null,
  };
}
