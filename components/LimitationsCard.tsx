import { TriangleAlert } from "lucide-react";

export function LimitationsCard({ limitations }: { limitations: string[] }) {
  return (
    <section className="xt-glass rounded-2xl p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
        <TriangleAlert className="h-5 w-5 text-amber-risk" aria-hidden="true" />
        Limitations
      </h2>
      {limitations.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {limitations.map((item, index) => (
            <li key={index} className="flex gap-2 text-sm leading-6 text-text-secondary">
              <span className="text-amber-risk">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-text-secondary">
          The model server did not report additional limitations. Results are still model-backed signals, not a
          definitive determination.
        </p>
      )}
    </section>
  );
}
