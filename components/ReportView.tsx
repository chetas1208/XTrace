"use client";

import { Download, Layers3 } from "lucide-react";
import { AgentStepsPanel } from "@/components/AgentStepsPanel";
import { ActionPanel } from "@/components/ActionPanel";
import { ClaudeReasoningCard } from "@/components/ClaudeReasoningCard";
import { EvidenceGraph } from "@/components/EvidenceGraph";
import { GuildWebhookCard } from "@/components/GuildWebhookCard";
import { HumanActionCard } from "@/components/HumanActionCard";
import { LimitationsCard } from "@/components/LimitationsCard";
import { MediaPreview } from "@/components/MediaPreview";
import { ModelReadinessCard } from "@/components/ModelReadinessCard";
import { OpenUIReportBlocks } from "@/components/OpenUIReportBlocks";
import { RawJsonViewer } from "@/components/RawJsonViewer";
import { RealityContextCard } from "@/components/RealityContextCard";
import { ReportHeader } from "@/components/ReportHeader";
import { RiskScoreCard } from "@/components/RiskScoreCard";
import { SignalCard } from "@/components/SignalCard";
import { SponsorStatusCard } from "@/components/SponsorStatusCard";
import { Button } from "@/components/ui/button";
import type { TraceProofReport } from "@/types/traceproof";

type Props = {
  report: TraceProofReport;
  previewFile?: File | null;
  mediaSrc?: string;
};

export function ReportView({ report, previewFile, mediaSrc }: Props) {
  return (
    <div className="space-y-6">
      <ReportHeader report={report} />

      <section id="risk" className="grid scroll-mt-24 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <RiskScoreCard report={report} />
        <div id="media-preview" className="scroll-mt-24">
          <MediaPreview
            file={previewFile ?? undefined}
            src={mediaSrc}
            fileName={report.file_name}
            mediaType={report.detected_media_type}
          />
        </div>
      </section>

      <ModelReadinessCard readiness={report.model_readiness} />

      <section className="xt-glass rounded-2xl p-5">
        <h2 className="text-lg font-semibold text-text-primary">Assessment Summary</h2>
        <p className="mt-3 leading-7 text-text-secondary">{report.summary}</p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <EvidenceGraph signals={report.signals} reasoningLayer={report.reasoning_layer} hasActions={false} />
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

      <AgentStepsPanel steps={report.agent_steps} />
      <OpenUIReportBlocks blocks={report.report_blocks} />

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

      <div id="claude" className="scroll-mt-24">
        <ClaudeReasoningCard
          reasoningLayer={report.reasoning_layer}
          confidenceRationale={report.confidence_rationale}
          weakestEvidence={report.weakest_evidence}
        />
      </div>

      <GuildWebhookCard webhook={report.guild_webhook} />

      {report.media_claim ? (
        <RealityContextCard
          jobId={report.job_id}
          mediaClaim={report.media_claim}
          initialContext={report.reality_context}
        />
      ) : null}

      <section className="grid gap-6 lg:grid-cols-2">
        <LimitationsCard limitations={report.limitations} />
        <HumanActionCard humanAction={report.human_action} finalLabel={report.final_label} />
      </section>

      <section id="actions" className="scroll-mt-24">
        <ActionPanel report={report} />
      </section>

      <SponsorStatusCard />

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <RawJsonViewer
          title="Raw response + sponsor trace + reasoning"
          data={{
            raw_model_response: report.raw_model_response,
            model_readiness: report.model_readiness,
            sponsor_trace: {
              guild_webhook: report.guild_webhook,
              reality_context: report.reality_context,
              media_claim: report.media_claim,
            },
            reasoning_layer: report.reasoning_layer,
            report_blocks: report.report_blocks,
            agent_steps: report.agent_steps,
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
  );
}
