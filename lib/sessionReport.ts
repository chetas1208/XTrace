import type { TraceProofReport } from "@/types/traceproof";

export const XTRACE_SESSION_REPORT_KEY = "xtrace.currentReport";

export function saveSessionReport(report: TraceProofReport): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(XTRACE_SESSION_REPORT_KEY, JSON.stringify(report));
  } catch {
    // Quota exceeded or private mode — in-memory state still works on analyze page.
  }
}

export function loadSessionReport(): TraceProofReport | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(XTRACE_SESSION_REPORT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TraceProofReport;
  } catch {
    return null;
  }
}

export function clearSessionReport(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(XTRACE_SESSION_REPORT_KEY);
}

/** Safe report payload for Composio action routes (no media bytes). */
export function actionReportPayload(report: TraceProofReport) {
  return {
    report: {
      job_id: report.job_id,
      request_id: report.request_id,
      file_name: report.file_name,
      detected_media_type: report.detected_media_type,
      final_label: report.final_label,
      risk_score: report.risk_score,
      confidence: report.confidence,
      summary: report.summary,
      strongest_evidence: report.strongest_evidence,
      weakest_evidence: report.weakest_evidence,
      limitations: report.limitations,
      human_action: report.human_action,
      signals: report.signals,
      reasoning_layer: report.reasoning_layer,
      guild_webhook: report.guild_webhook,
      reality_context: report.reality_context,
      model_readiness: report.model_readiness,
    },
  };
}
