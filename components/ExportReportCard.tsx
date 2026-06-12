"use client";

import { useCallback, useState } from "react";
import { FileJson, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatConfidence, formatRiskScore, labelToDisplay, readableMediaType } from "@/lib/utils";
import type { TraceProofReport } from "@/types/traceproof";

/**
 * Client-side report export. Both paths run entirely in the browser from the
 * in-session report — no server round-trip, no secrets, nothing persisted.
 *  - JSON: the full structured report (the auditable artifact).
 *  - PDF: a clean printable view via the browser's "Save as PDF".
 */

function safeBaseName(report: TraceProofReport): string {
  const base = (report.file_name || "report").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const stamp = (report.created_at || new Date().toISOString()).slice(0, 19).replace(/[:T]/g, "-");
  return `xtrace-${base}-${stamp}`;
}

function triggerDownload(filename: string, mime: string, contents: BlobPart): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function list(items: string[]): string {
  if (!items.length) return "<p class='muted'>None reported.</p>";
  return `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
}

function buildPrintableHtml(report: TraceProofReport): string {
  const signalsRows = report.signals
    .map(
      (s) => `<tr>
        <td>${escapeHtml(s.model_name)}</td>
        <td>${escapeHtml(s.modality)}</td>
        <td>${escapeHtml(s.status)}</td>
        <td>${s.score === null ? "—" : escapeHtml(s.score.toFixed(3))}</td>
        <td>${escapeHtml(s.label ?? "—")}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>XTrace report — ${escapeHtml(report.file_name)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #111; margin: 32px; line-height: 1.5; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 24px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  .meta { color: #555; font-size: 12px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 12px; }
  .stat { border: 1px solid #e2e2e2; border-radius: 8px; padding: 10px 12px; }
  .stat .k { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #666; }
  .stat .v { font-size: 18px; font-weight: 700; margin-top: 2px; }
  .label { display: inline-block; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 13px; background: #eef2ff; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #eee; }
  th { background: #fafafa; }
  ul { margin: 6px 0; padding-left: 20px; font-size: 13px; }
  .muted { color: #888; font-size: 13px; }
  .foot { margin-top: 28px; color: #888; font-size: 11px; border-top: 1px solid #eee; padding-top: 8px; }
</style>
</head>
<body>
  <h1>XTrace forensic report</h1>
  <p class="meta">${escapeHtml(report.file_name)} · ${escapeHtml(readableMediaType(report.detected_media_type))} · ${escapeHtml(report.created_at)}</p>
  <p class="meta">Job ${escapeHtml(report.job_id)} · Request ${escapeHtml(report.request_id)}</p>

  <div class="grid">
    <div class="stat"><div class="k">Label</div><div class="v"><span class="label">${escapeHtml(labelToDisplay(report.final_label))}</span></div></div>
    <div class="stat"><div class="k">Risk score</div><div class="v">${escapeHtml(formatRiskScore(report.risk_score))}</div></div>
    <div class="stat"><div class="k">Confidence</div><div class="v">${escapeHtml(formatConfidence(report.confidence))}</div></div>
  </div>

  <h2>Assessment summary</h2>
  <p>${escapeHtml(report.summary)}</p>

  <h2>Recommended human action</h2>
  <p>${escapeHtml(report.human_action)}</p>

  <h2>Model signals (${report.signals.length})</h2>
  <table>
    <thead><tr><th>Model</th><th>Modality</th><th>Status</th><th>Score</th><th>Label</th></tr></thead>
    <tbody>${signalsRows}</tbody>
  </table>

  <h2>Strongest evidence</h2>
  ${list(report.strongest_evidence)}

  <h2>Limitations</h2>
  ${list(report.limitations)}

  <h2>Reasoning layer</h2>
  <p class="muted">${escapeHtml(report.reasoning_layer.provider)} · ${escapeHtml(report.reasoning_layer.model ?? "deterministic")} · ${escapeHtml(report.reasoning_layer.status)}</p>
  <p>${escapeHtml(report.confidence_rationale)}</p>

  <p class="foot">Generated by XTrace. Claude summarizes model-backed evidence only; it does not decide "fake" or "real". This report requires human review and is not a definitive determination.</p>
</body>
</html>`;
}

export function ExportReportCard({ report }: { report: TraceProofReport }) {
  const [printing, setPrinting] = useState(false);

  const exportJson = useCallback(() => {
    triggerDownload(`${safeBaseName(report)}.json`, "application/json", JSON.stringify(report, null, 2));
  }, [report]);

  const exportPdf = useCallback(() => {
    setPrinting(true);
    try {
      const win = window.open("", "_blank", "noopener,noreferrer,width=900,height=1000");
      if (!win) {
        // Popup blocked — fall back to downloading the printable HTML.
        triggerDownload(`${safeBaseName(report)}.html`, "text/html", buildPrintableHtml(report));
        return;
      }
      win.document.open();
      win.document.write(buildPrintableHtml(report));
      win.document.close();
      win.focus();
      // Give the new document a tick to lay out before invoking print.
      setTimeout(() => {
        try {
          win.print();
        } catch {
          /* user can print manually */
        }
      }, 350);
    } finally {
      setPrinting(false);
    }
  }, [report]);

  return (
    <section className="xt-glass rounded-2xl p-5">
      <h2 className="text-lg font-semibold text-text-primary">Export Report</h2>
      <p className="mt-3 text-sm leading-6 text-text-secondary">
        Download the full structured report as JSON, or save a clean PDF for sharing. Everything is generated in your
        browser from this session — nothing is uploaded or stored.
      </p>
      <div className="mt-5 space-y-3">
        <Button type="button" variant="primary" className="w-full" onClick={exportJson}>
          <FileJson className="h-4 w-4" aria-hidden="true" />
          Download JSON
        </Button>
        <Button type="button" variant="secondary" className="w-full" onClick={exportPdf} disabled={printing}>
          <Printer className="h-4 w-4" aria-hidden="true" />
          {printing ? "Preparing…" : "Print / Save as PDF"}
        </Button>
      </div>
    </section>
  );
}
