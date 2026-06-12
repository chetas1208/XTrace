"use client";

import { useState } from "react";
import { Loader2, MessageSquare } from "lucide-react";
import type { FeedbackRating } from "@/types/traceproof";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const RATINGS: Array<{ value: FeedbackRating; label: string }> = [
  { value: "correct", label: "Correct" },
  { value: "uncertain", label: "Uncertain" },
  { value: "wrong", label: "Wrong" },
  { value: "missed_artifact", label: "Missed artifact" },
  { value: "overconfident", label: "Overconfident" },
  { value: "underconfident", label: "Underconfident" },
];

type SubmitState = {
  saved: boolean;
  message: string;
} | null;

export function FeedbackPanel({ jobId }: { jobId: string }) {
  const [rating, setRating] = useState<FeedbackRating | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitState>(null);

  async function submit() {
    if (!rating) return;
    setSubmitting(true);
    setResult(null);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, rating, comment: comment.trim() || undefined }),
      });
      const data = (await response.json().catch(() => null)) as { status?: string; message?: string } | null;
      if (data?.status === "saved") {
        setResult({ saved: true, message: data.message ?? "Feedback saved for local review." });
      } else {
        setResult({ saved: false, message: data?.message ?? "Feedback could not be saved." });
      }
    } catch {
      setResult({ saved: false, message: "Feedback request failed." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="xt-glass rounded-2xl p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
        <MessageSquare className="h-5 w-5 text-cyan-signal" aria-hidden="true" />
        Local review
      </h2>
      <p className="mt-2 text-sm leading-6 text-text-secondary">
        XTrace improves through human review. Reviewer feedback is saved locally as high-signal failure data for future
        model evaluation and adaptation.
      </p>

      <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Feedback rating">
        {RATINGS.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={rating === item.value}
            onClick={() => setRating(item.value)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm transition",
              rating === item.value
                ? "border-cyan-signal bg-cyan-signal/10 text-cyan-signal"
                : "border-border bg-background/55 text-text-secondary hover:bg-panel-soft",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="Optional comment for the reviewer record"
        rows={2}
        className="mt-3 w-full rounded-md border border-border bg-background/55 p-3 text-sm text-text-primary placeholder:text-text-secondary focus:border-cyan-signal focus:outline-none"
      />

      <Button type="button" className="mt-3" disabled={!rating || submitting} onClick={submit}>
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        Submit feedback
      </Button>

      {result ? (
        <div
          className={cn(
            "mt-3 rounded-md border px-3 py-2 text-sm",
            result.saved
              ? "border-green-verified/40 bg-green-verified/10 text-green-verified"
              : "border-red-risk/45 bg-red-risk/10 text-red-risk",
          )}
        >
          {result.message}
        </div>
      ) : null}
    </section>
  );
}
