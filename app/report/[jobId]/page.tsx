"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, Download, Layers3, Loader2 } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { ActionPanel } from "@/components/ActionPanel";
import { ClaudeReasoningCard } from "@/components/ClaudeReasoningCard";
import { EvidenceGraph } from "@/components/EvidenceGraph";
import { FeedbackPanel } from "@/components/FeedbackPanel";
import { HumanActionCard } from "@/components/HumanActionCard";
import { LimitationsCard } from "@/components/LimitationsCard";
import { MediaPreview } from "@/components/MediaPreview";
import { OpenUIReportBlocks } from "@/components/OpenUIReportBlocks";
import { RawJsonViewer } from "@/components/RawJsonViewer";
import { RealityContextCard } from "@/components/RealityContextCard";
import { ReportHeader } from "@/components/ReportHeader";
import { ResearchTraceCard } from "@/components/ResearchTraceCard";
import { RiskScoreCard } from "@/components/RiskScoreCard";
import { SignalCard } from "@/components/SignalCard";
import { SponsorStatusCard } from "@/components/SponsorStatusCard";
import { Button } from "@/components/ui/button";
import type { JobEnvelope } from "@/types/traceproof";

export default function ReportPage() {
  const params = useParams<{ jobId: string }>();
  const [envelope, setEnvelope] = useState<JobEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadReport() {
      setError(null);
      try {
        const response = await fetch(`/api/jobs/${params.jobId}`, { cache: "no-store" });
        if (response.status === 404) {
          throw new Error("This analysis job was not found.");
        }
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "Report could not be loaded.");
        }
        const body = (await response.json()) as JobEnvelope;
        if (active) setEnvelope(body);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Report could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadReport();
    return () => {
      active = false;
    };
  }, [params.jobId]);

  const report = envelope?.report ?? null;
  const failed = envelope?.status === "failed";
  const failureMessage =
    envelope?.failure_message ?? (envelope?.errors.length ? envelope.errors.join(" ") : null);

  return (
    <main className="min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {loading && !error ? (
          <section className="grid min-h-[24rem] place-items-center rounded-lg border border-border bg-panel p-8 text-center">
            <div>
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-cyan-signal" aria-hidden="true" />
              <h1 className="mt-5 text-2xl font-semibold text-text-primary">Loading report</h1>
              <p className="mt-3 max-w-xl text-text-secondary">Fetching the stored analysis for this job.</p>
            </div>
          </section>
        ) : null}

        {error ? (
          <section className="rounded-lg border border-red-risk/35 bg-red-risk/10 p-6">
            <AlertTriangle className="h-6 w-6 text-red-risk" aria-hidden="true" />
            <h1 className="mt-4 text-2xl font-semibold text-text-primary">Report unavailable</h1>
            <p className="mt-3 text-text-secondary">{error}</p>
            <Link
              href="/analyze"
              className="mt-6 inline-flex rounded-md bg-cyan-signal px-4 py-2.5 text-sm font-semibold text-background"
            >
              Create new analysis
            </Link>
          </section>
        ) : null}

        {!error && failed ? (
          <section className="space-y-6">
            <div className="rounded-lg border border-red-risk/35 bg-red-risk/10 p-6">
              <AlertTriangle className="h-6 w-6 text-red-risk" aria-hidden="true" />
              <h1 className="mt-4 text-2xl font-semibold text-text-primary">Analysis failed</h1>
              <p className="mt-3 text-text-secondary">
                {failureMessage ?? "The GPU model server did not return a result. No inference was performed."}
              </p>
              <p className="mt-2 text-sm text-text-secondary">
                No mock report or fabricated scores are shown for failed jobs.
              </p>
              <Link
                href="/analyze"
                className="mt-6 inline-flex rounded-md bg-cyan-signal px-4 py-2.5 text-sm font-semibold text-background"
              >
                Try another file
              </Link>
            </div>
          </section>
        ) : null}

        {!error && report ? (
          <div className="space-y-6">
            {/* A. XTrace report header */}
            <ReportHeader report={report} />

            {/* B. Media preview + C. risk / confidence / label */}
            <section id="risk" className="grid scroll-mt-24 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <RiskScoreCard report={report} />
              <div id="media-preview" className="scroll-mt-24">
                <MediaPreview
                  src={`/api/jobs/${report.job_id}/media`}
                  fileName={report.file_name}
                  mediaType={report.detected_media_type}
                />
              </div>
            </section>

            {/* Assessment summary */}
            <section className="xt-glass rounded-2xl p-5">
              <h2 className="text-lg font-semibold text-text-primary">Assessment Summary</h2>
              <p className="mt-3 leading-7 text-text-secondary">{report.summary}</p>
            </section>

            {/* D. 3D/forensic evidence graph + strongest evidence */}
            <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
              <EvidenceGraph
                signals={report.signals}
                reasoningLayer={report.reasoning_layer}
                hasActions={(envelope?.actions?.length ?? 0) > 0}
              />
              <div className="xt-glass rounded-2xl p-5">
                <h2 className="text-lg font-semibold text-text-primary">Strongest Evidence</h2>
                {report.strongest_evidence.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {report.strongest_evidence.map((item, index) => (
                      <div key={index} className="rounded-md border border-border bg-background/55 p-3 text-sm text-text-primary">
                        {item}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-text-secondary">
                    No single signal was flagged as strongest evidence by the model server.
                  </p>
                )}
              </div>
            </section>

            {/* OpenUI dynamic report blocks */}
            <OpenUIReportBlocks blocks={report.report_blocks} />

            {/* E. Model signal cards */}
            <section id="model-signals" className="scroll-mt-24">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-text-primary">
                <Layers3 className="h-5 w-5 text-cyan-signal" aria-hidden="true" />
                Model Signals ({report.signals.length})
              </h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {report.signals.map((signal, index) => (
                  <SignalCard key={`${signal.model_name}-${index}`} signal={signal} />
                ))}
              </div>
            </section>

            {/* F. Claude reasoning card */}
            <div id="claude" className="scroll-mt-24">
              <ClaudeReasoningCard
                reasoningLayer={report.reasoning_layer}
                confidenceRationale={report.confidence_rationale}
                weakestEvidence={report.weakest_evidence}
              />
            </div>

            {/* G. Guild run/session ledger */}
            <ResearchTraceCard guild={report.guild} />

            {/* H. Jua reality-context card (only when a claim exists) */}
            {report.media_claim ? (
              <RealityContextCard
                jobId={report.job_id}
                mediaClaim={report.media_claim}
                initialContext={report.reality_context}
              />
            ) : null}

            {/* Limitations + human action */}
            <section className="grid gap-6 lg:grid-cols-2">
              <LimitationsCard limitations={report.limitations} />
              <HumanActionCard humanAction={report.human_action} finalLabel={report.final_label} />
            </section>

            {/* I. Composio action panel + J. local review */}
            <section id="actions" className="grid scroll-mt-24 gap-6 lg:grid-cols-2">
              <ActionPanel report={report} />
              <FeedbackPanel jobId={report.job_id} />
            </section>

            {/* Sponsor integration availability */}
            <SponsorStatusCard />

            {/* K. Raw JSON drawer + export placeholder */}
            <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
              <RawJsonViewer
                title="Raw response + sponsor trace + reasoning"
                data={{
                  raw_model_response: report.raw_model_response,
                  sponsor_trace: {
                    guild: report.guild,
                    reality_context: report.reality_context,
                    media_claim: report.media_claim,
                  },
                  reasoning_layer: report.reasoning_layer,
                  report_blocks: report.report_blocks,
                }}
              />
              <section className="xt-glass rounded-2xl p-5">
                <h2 className="text-lg font-semibold text-text-primary">Export Report</h2>
                <p className="mt-3 text-sm leading-6 text-text-secondary">
                  Signed PDF/JSON export is reserved for the production evidence-package pipeline.
                </p>
                <Button type="button" disabled variant="muted" className="mt-5 w-full">
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Export unavailable
                </Button>
              </section>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
