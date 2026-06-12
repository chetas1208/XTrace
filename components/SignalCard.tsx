import { Cpu, Timer } from "lucide-react";
import type { ModelSignal } from "@/types/traceproof";
import {
  cn,
  formatConfidence,
  formatRuntime,
  formatSignalScore,
  signalBarColor,
  signalScorePercent,
  signalStatusClassName,
} from "@/lib/utils";

export function SignalCard({ signal }: { signal: ModelSignal }) {
  const hasScore = signal.score !== null;
  const barWidth = signalScorePercent(signal.score);

  return (
    <article className="flex flex-col xt-glass rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-text-primary">{signal.model_name}</h3>
          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-text-secondary">{signal.modality}</p>
        </div>
        <span className={cn("shrink-0 rounded-md border px-2 py-1 text-xs font-medium", signalStatusClassName(signal.status))}>
          {signal.status}
        </span>
      </div>

      {signal.label ? <p className="mt-3 text-sm text-text-primary">{signal.label}</p> : null}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Score</p>
          <p className="mt-1 text-sm font-semibold text-text-primary">{formatSignalScore(signal.score)}</p>
        </div>
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Confidence</p>
          <p className="mt-1 text-sm font-semibold text-text-primary">{formatConfidence(signal.confidence)}</p>
        </div>
      </div>

      {hasScore ? (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-background">
          <div className="h-full rounded-full" style={{ width: `${barWidth}%`, backgroundColor: signalBarColor(signal.status) }} />
        </div>
      ) : null}

      {signal.evidence.length > 0 ? (
        <div className="mt-4">
          <p className="text-[0.65rem] uppercase tracking-[0.14em] text-text-secondary">Evidence</p>
          <ul className="mt-2 space-y-1.5">
            {signal.evidence.map((item, index) => (
              <li key={index} className="text-xs leading-5 text-text-primary">
                • {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {signal.limitations.length > 0 ? (
        <div className="mt-3">
          <p className="text-[0.65rem] uppercase tracking-[0.14em] text-amber-risk">Limitations</p>
          <ul className="mt-2 space-y-1.5">
            {signal.limitations.map((item, index) => (
              <li key={index} className="text-xs leading-5 text-text-secondary">
                • {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3 text-xs text-text-secondary">
        <span className="flex items-center gap-1.5">
          <Timer className="h-3.5 w-3.5" aria-hidden="true" />
          {formatRuntime(signal.runtime_ms)}
        </span>
        <span className="flex items-center gap-1.5">
          <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
          {signal.device || "N/A"}
        </span>
      </div>
    </article>
  );
}
