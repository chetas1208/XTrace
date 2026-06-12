import { FileSearch } from "lucide-react";
import type { TraceProofReport } from "@/types/traceproof";
import { labelClassName, labelToDisplay, readableMediaType } from "@/lib/utils";

export function ReportHeader({ report }: { report: TraceProofReport }) {
  return (
    <section className="xt-glass rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-cyan-signal">
            <FileSearch className="h-4 w-4" aria-hidden="true" />
            XTrace Forensic Report
          </p>
          <h1 className="mt-2 break-all text-2xl font-semibold text-text-primary sm:text-3xl">{report.file_name}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-border bg-panel-soft px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-text-secondary">
              {readableMediaType(report.detected_media_type)}
            </span>
            <span className={`rounded-md border px-3 py-1.5 text-xs font-medium ${labelClassName(report.final_label)}`}>
              {labelToDisplay(report.final_label)}
            </span>
          </div>
        </div>
        <dl className="grid gap-1 text-right">
          <dt className="text-xs uppercase tracking-[0.14em] text-text-secondary">Created</dt>
          <dd className="text-sm text-text-primary">{new Date(report.created_at).toLocaleString()}</dd>
          <dt className="mt-2 text-xs uppercase tracking-[0.14em] text-text-secondary">Request ID</dt>
          <dd className="break-all font-mono text-xs text-text-secondary">{report.request_id}</dd>
        </dl>
      </div>
    </section>
  );
}
