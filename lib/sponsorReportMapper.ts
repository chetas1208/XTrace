import type {
  GuildArtifact,
  GuildTrace,
  MediaClaim,
  RealityContextSignal,
  TraceProofReport,
} from "@/types/traceproof";

// ---------------------------------------------------------------------------
// Pure builders for the sponsor layer. No secrets, no network — these only
// transform an existing real report into action payloads, and decide whether a
// claim is reality-context relevant. Used by the server-side sponsor clients.
// ---------------------------------------------------------------------------

const NOT_DEFINITIVE_NOTE =
  "XTrace is not a definitive fake/real judgment. It reports model-backed provenance-risk signals for human review.";
const JUA_DISCLAIMER = "Jua checks weather/location plausibility only. It does not detect deepfakes.";

function num(value: number | null, digits = 2): string {
  return value === null || Number.isNaN(value) ? "N/A" : value.toFixed(digits).replace(/\.0+$/, "");
}

function signalSummaryLines(report: TraceProofReport): string[] {
  return report.signals.map((s) => {
    const score = s.score === null ? "N/A" : s.score.toFixed(3);
    return `- ${s.model_name} (${s.modality}): ${s.status}, score ${score}, device ${s.device || "N/A"}`;
  });
}

function guildStatusLine(report: TraceProofReport): string {
  if (report.guild_webhook) return `Guild webhook status: ${report.guild_webhook.status}`;
  if (!report.guild) return "Guild webhook status: unavailable";
  return `Guild webhook status: ${report.guild.status}${report.guild.run_id ? ` (${report.guild.run_id})` : ""}`;
}

function juaStatusLine(report: TraceProofReport): string {
  return `Jua reality-context status: ${report.reality_context?.status ?? "skipped"}`;
}

export function buildGithubIssueTitle(report: TraceProofReport): string {
  return `[XTrace] ${report.final_label} - ${report.file_name}`;
}

export function buildGithubIssueBody(report: TraceProofReport): string {
  const lines: string[] = [];
  lines.push("## Summary");
  lines.push(report.summary || "XTrace report generated from model-backed forensic signals.");
  lines.push("");
  lines.push("## Media type");
  lines.push(`- File: ${report.file_name}`);
  lines.push(`- Detected media type: ${report.detected_media_type}`);
  lines.push("");
  lines.push("## Risk score");
  lines.push(`- Final label: ${report.final_label}`);
  lines.push(`- Risk score: ${num(report.risk_score)} / 100`);
  lines.push("");
  lines.push("## Confidence");
  lines.push(`- Confidence: ${report.confidence === null ? "N/A" : `${Math.round(report.confidence * 100)}%`}`);
  lines.push(`- Rationale: ${report.confidence_rationale || "N/A"}`);
  lines.push("");
  lines.push("## Strongest evidence");
  if (report.strongest_evidence.length) report.strongest_evidence.forEach((e) => lines.push(`- ${e}`));
  else lines.push("- (none reported)");
  lines.push("");
  lines.push("## Weakest evidence");
  if (report.weakest_evidence.length) report.weakest_evidence.forEach((e) => lines.push(`- ${e}`));
  else lines.push("- (none reported)");
  lines.push("");
  lines.push("## Limitations");
  if (report.limitations.length) report.limitations.forEach((l) => lines.push(`- ${l}`));
  else lines.push("- (none reported)");
  lines.push("");
  lines.push("## Recommended human action");
  lines.push(report.human_action);
  lines.push("");
  lines.push("## Model signals");
  signalSummaryLines(report).forEach((l) => lines.push(l));
  lines.push("");
  lines.push("## Guild webhook status");
  lines.push(`- ${guildStatusLine(report)}`);
  lines.push("");
  lines.push("## Jua reality-context status");
  lines.push(`- ${juaStatusLine(report)}`);
  lines.push("");
  lines.push("## Disclaimer");
  lines.push(NOT_DEFINITIVE_NOTE);
  return lines.join("\n");
}

export function buildSlackText(report: TraceProofReport, reportUrl?: string | null): string {
  const risk = num(report.risk_score);
  const conf = report.confidence === null ? "N/A" : `${Math.round(report.confidence * 100)}%`;
  const successCount = report.signals.filter((s) => s.status === "success").length;
  const strongest = report.strongest_evidence[0] ? `\n• Top signal: ${report.strongest_evidence[0]}` : "";
  const link = reportUrl ? `\n• Report: ${reportUrl}` : "";
  return (
    `*XTrace Forensic Report*\n` +
    `• File: ${report.file_name} (${report.detected_media_type})\n` +
    `• Label: *${report.final_label}*  |  Risk: ${risk}/100  |  Confidence: ${conf}\n` +
    `• Model signals: ${successCount}/${report.signals.length} successful${strongest}\n` +
    `• Action: ${report.human_action}${link}\n` +
    `_${NOT_DEFINITIVE_NOTE}_`
  );
}

export function buildNotionProperties(report: TraceProofReport, databaseId: string) {
  return {
    parent: { database_id: databaseId },
    title: buildGithubIssueTitle(report),
    properties: {
      Name: buildGithubIssueTitle(report),
      Label: report.final_label,
      RiskScore: report.risk_score,
      Confidence: report.confidence,
      MediaType: report.detected_media_type,
      JobId: report.job_id,
    },
    content: buildGithubIssueBody(report),
  };
}

// --- Jua reality-context relevance gating -----------------------------------

export const REALITY_CONTEXT_KEYWORDS = [
  "weather",
  "climate",
  "flood",
  "flooding",
  "wildfire",
  "fire",
  "smoke",
  "storm",
  "hurricane",
  "typhoon",
  "cyclone",
  "tornado",
  "rain",
  "snow",
  "heat",
  "heatwave",
  "temperature",
  "wind",
  "drought",
  "disaster",
  "happened",
  "date",
  "time",
  "today",
  "yesterday",
  "tomorrow",
  "filmed in",
  "recorded in",
  "filmed",
  "recorded",
  "taken in",
  "location",
];

/**
 * A claim is reality-context relevant if it references weather/disaster terms,
 * or a place/time signal (explicit location/datetime, or a date-like token).
 */
export function isRealityClaimRelevant(params: {
  claim: string;
  location?: string | null;
  datetime?: string | null;
}): boolean {
  const claim = (params.claim ?? "").toLowerCase();
  if (!claim.trim() && !params.location && !params.datetime) return false;
  if (params.location && params.location.trim()) return true;
  if (params.datetime && params.datetime.trim()) return true;
  if (REALITY_CONTEXT_KEYWORDS.some((kw) => claim.includes(kw))) return true;
  // Date-like tokens (e.g. 2026, 12/06, Jan 5) imply a time claim.
  if (/\b(19|20)\d{2}\b/.test(claim) || /\b\d{1,2}[/-]\d{1,2}\b/.test(claim)) return true;
  return false;
}

export const JUA_SKIP_MESSAGE =
  "No weather/location/time claim was provided, so Jua was skipped.";

export function buildJuaSkippedSignal(claim?: Partial<MediaClaim> | null): RealityContextSignal {
  return {
    provider: "Jua",
    status: "skipped",
    claim: claim?.claim || null,
    location: claim?.location ?? null,
    datetime: claim?.datetime ?? null,
    evidence: [],
    limitations: [JUA_SKIP_MESSAGE],
    reality_context_risk: null,
    disclaimer: JUA_DISCLAIMER,
  };
}

export function buildJuaUnavailableSignal(claim: Partial<MediaClaim> | null, reason: string): RealityContextSignal {
  return {
    provider: "Jua",
    status: "unavailable",
    claim: claim?.claim || null,
    location: claim?.location ?? null,
    datetime: claim?.datetime ?? null,
    evidence: [],
    limitations: [reason],
    reality_context_risk: null,
    disclaimer: JUA_DISCLAIMER,
  };
}

// --- Guild artifact URL resolution (no fabrication) -------------------------

/**
 * Fill in artifact URLs from a configured artifact base when the model server
 * left them null. Never fabricates run IDs or artifacts — only resolves a URL
 * for an artifact that already exists in the trace.
 */
export function resolveGuildArtifactUrls(
  artifacts: GuildArtifact[],
  artifactBaseUrl: string,
): GuildArtifact[] {
  if (!artifactBaseUrl) return artifacts;
  const base = artifactBaseUrl.replace(/\/$/, "");
  return artifacts.map((a) => ({
    ...a,
    url: a.url ?? (a.path ? `${base}/${a.path.replace(/^\//, "")}` : null),
  }));
}

export function normalizeGuildTrace(trace: GuildTrace, artifactBaseUrl: string): GuildTrace {
  return { ...trace, artifacts: resolveGuildArtifactUrls(trace.artifacts, artifactBaseUrl) };
}
