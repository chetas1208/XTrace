import { ShieldCheck } from "lucide-react";
import type { FinalLabel } from "@/types/traceproof";
import { labelClassName, labelToDisplay } from "@/lib/utils";

export function HumanActionCard({ humanAction, finalLabel }: { humanAction: string; finalLabel: FinalLabel }) {
  return (
    <section className="rounded-lg border border-border bg-panel p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
        <ShieldCheck className="h-5 w-5 text-green-verified" aria-hidden="true" />
        Recommended Human Action
      </h2>
      <div className="mt-3">
        <span className={`rounded-md border px-3 py-1.5 text-xs font-medium ${labelClassName(finalLabel)}`}>
          {labelToDisplay(finalLabel)}
        </span>
      </div>
      <p className="mt-4 leading-7 text-text-secondary">{humanAction}</p>
      <p className="mt-4 text-xs leading-6 text-text-secondary">
        XTrace produces model-backed provenance-risk signals, not a definitive authenticity ruling. Final
        decisions require human review.
      </p>
    </section>
  );
}
