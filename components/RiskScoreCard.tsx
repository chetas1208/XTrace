import type { TraceProofReport } from "@/types/traceproof";
import {
  clamp,
  formatConfidence,
  formatRiskScore,
  labelClassName,
  labelToDisplay,
  riskColor,
} from "@/lib/utils";

export function RiskScoreCard({ report }: { report: TraceProofReport }) {
  const score = report.risk_score;
  const color = riskColor(score);
  const ringDegrees = score === null ? 0 : clamp(score, 0, 100) * 3.6;

  return (
    <section className="xt-glass rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-text-secondary">Provenance risk</p>
          <div className="mt-3">
            <span className={`rounded-md border px-3 py-1.5 text-sm font-medium ${labelClassName(report.final_label)}`}>
              {labelToDisplay(report.final_label)}
            </span>
          </div>
          <p className="mt-4 max-w-md text-sm leading-6 text-text-secondary">
            Risk and confidence are fused from independent model-backed signals. Scores are model output and are not a
            definitive authenticity verdict.
          </p>
        </div>

        <div className="grid min-w-56 grid-cols-[7rem_1fr] items-center gap-4">
          <div
            className="grid h-28 w-28 place-items-center rounded-full"
            style={{ background: `conic-gradient(${color} ${ringDegrees}deg, #273244 0deg)` }}
            aria-label={`Risk score ${formatRiskScore(score)} out of 100`}
          >
            <div className="grid h-[5.7rem] w-[5.7rem] place-items-center rounded-full bg-background">
              <span className="text-2xl font-semibold text-text-primary">{formatRiskScore(score)}</span>
              <span className="-mt-1 text-[0.6rem] uppercase tracking-[0.18em] text-text-secondary">/ 100 risk</span>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-text-secondary">Confidence</p>
              <p className="mt-1 text-xl font-semibold text-text-primary">{formatConfidence(report.confidence)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-text-secondary">Signals</p>
              <p className="mt-1 text-xl font-semibold text-text-primary">{report.signals.length}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
