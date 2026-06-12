"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CloudSun, Radar, RotateCcw, ShieldAlert } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { AnalysisProgress, type ProgressStatus } from "@/components/AnalysisProgress";
import { ForensicOrb } from "@/components/ForensicOrb";
import { MediaPreview } from "@/components/MediaPreview";
import { ReportView } from "@/components/ReportView";
import { UploadDropzone } from "@/components/UploadDropzone";
import { Button } from "@/components/ui/button";
import { clearSessionReport, saveSessionReport } from "@/lib/sessionReport";
import { readableMediaType } from "@/lib/utils";
import type { AnalyzeResponse, DetectedMediaType, TraceProofReport } from "@/types/traceproof";

type SelectedType = Exclude<DetectedMediaType, "unsupported">;

type SystemStatus = {
  model_server: { available: boolean; health?: string; models_ready?: boolean };
  anthropic: { configured: boolean; available: boolean; model: string };
};

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
        ok
          ? "border-green-verified/40 bg-green-verified/10 text-green-verified"
          : "border-amber-risk/40 bg-amber-risk/10 text-amber-risk"
      }`}
    >
      <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
      {label}
    </span>
  );
}

export default function AnalyzePage() {
  const reduceMotion = useReducedMotion();
  const [file, setFile] = useState<File | null>(null);
  const [detectedType, setDetectedType] = useState<SelectedType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressStatus>("idle");
  const [runId, setRunId] = useState(0);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [claim, setClaim] = useState("");
  const [claimLocation, setClaimLocation] = useState("");
  const [claimDatetime, setClaimDatetime] = useState("");
  const [report, setReport] = useState<TraceProofReport | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/system-status")
      .then((r) => r.json())
      .then((data: SystemStatus) => {
        if (active) setStatus(data);
      })
      .catch(() => {
        if (active) setStatus(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const isAnalyzing = progress === "running";

  const runAnalysis = useCallback(
    async (selectedFile: File, selectedType: SelectedType) => {
      setError(null);
      setReport(null);
      setRunId((id) => id + 1);
      setProgress("running");

      try {
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("file_name", selectedFile.name);
        if (claim.trim()) formData.append("claim", claim.trim());
        if (claimLocation.trim()) formData.append("location", claimLocation.trim());
        if (claimDatetime.trim()) formData.append("datetime", claimDatetime.trim());

        const response = await fetch("/api/analyze", { method: "POST", body: formData });
        const body = (await response.json().catch(() => null)) as AnalyzeResponse | null;

        if (!body) {
          throw new Error("The analysis service returned an unreadable response.");
        }

        if (body.status === "completed" && body.report) {
          setReport(body.report);
          saveSessionReport(body.report);
          setProgress("done");
          return;
        }

        const readinessMsg = body.model_readiness?.message;
        throw new Error(body.error ?? readinessMsg ?? "Analysis could not be completed.");
      } catch (cause) {
        setProgress("failed");
        setError(cause instanceof Error ? cause.message : "Analysis could not be completed.");
      }
    },
    [claim, claimLocation, claimDatetime],
  );

  function handleFileSelected(selectedFile: File, selectedType: SelectedType) {
    setFile(selectedFile);
    setDetectedType(selectedType);
    void runAnalysis(selectedFile, selectedType);
  }

  function resetWorkspace() {
    clearSessionReport();
    setFile(null);
    setDetectedType(null);
    setReport(null);
    setError(null);
    setProgress("idle");
  }

  return (
    <main className="min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-cyan-signal">XTrace web agent</p>
            <h1 className="mt-3 text-3xl font-semibold text-text-primary sm:text-4xl">Media forensics command center</h1>
            <p className="mt-3 max-w-3xl leading-7 text-text-secondary">
              Drop media to launch the XTrace agent. Analysis starts immediately — no submit button. The agent detects
              media type, routes through Cloudflare tunnel to GPU forensics, reasons with Claude, and returns an
              auditable report stored in this session only.
            </p>
          </div>
          {status ? (
            <div className="flex flex-wrap gap-2">
              <StatusPill
                ok={status.model_server.available}
                label={`GPU server: ${status.model_server.available ? "healthy" : "unavailable"}`}
              />
              <StatusPill
                ok={status.anthropic.available}
                label={`Claude: ${status.anthropic.available ? status.anthropic.model : "deterministic"}`}
              />
            </div>
          ) : null}
        </div>

        {!report ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
            <div className="space-y-6">
              <UploadDropzone disabled={isAnalyzing} onFileSelected={handleFileSelected} />
              {file && detectedType ? (
                <MediaPreview
                  key={`${file.name}-${file.size}-${file.lastModified}`}
                  file={file}
                  fileName={file.name}
                  mediaType={detectedType}
                />
              ) : null}
              {reduceMotion ? null : (
                <div className="hidden lg:block">
                  <ForensicOrb height={280} />
                </div>
              )}
            </div>

            <aside className="space-y-6">
              <section className="xt-glass rounded-2xl p-5">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
                  <Radar className="h-5 w-5 text-cyan-signal" aria-hidden="true" />
                  Detected media type
                </h2>
                {detectedType ? (
                  <div className="mt-4">
                    <span className="rounded-md border border-cyan-signal/35 bg-cyan-signal/10 px-3 py-1.5 text-sm font-medium text-cyan-signal">
                      {readableMediaType(detectedType)}
                    </span>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-text-secondary">Upload a file to detect its type automatically.</p>
                )}
              </section>

              <section className="xt-glass rounded-2xl p-5">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
                  <CloudSun className="h-5 w-5 text-cyan-signal" aria-hidden="true" />
                  Optional media claim
                </h2>
                <p className="mt-2 text-xs leading-5 text-text-secondary">
                  Weather/location/time claims enable optional Jua reality-context checking at upload time.
                </p>
                <textarea
                  value={claim}
                  onChange={(event) => setClaim(event.target.value)}
                  placeholder="Example: This flood video was filmed in San Francisco today."
                  rows={2}
                  disabled={isAnalyzing}
                  className="mt-3 w-full rounded-md border border-border bg-background/55 p-3 text-sm text-text-primary placeholder:text-text-secondary focus:border-cyan-signal focus:outline-none"
                />
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input
                    type="text"
                    value={claimLocation}
                    onChange={(event) => setClaimLocation(event.target.value)}
                    placeholder="Location (optional)"
                    disabled={isAnalyzing}
                    className="rounded-md border border-border bg-background/55 p-2.5 text-sm text-text-primary placeholder:text-text-secondary focus:border-cyan-signal focus:outline-none"
                  />
                  <input
                    type="text"
                    value={claimDatetime}
                    onChange={(event) => setClaimDatetime(event.target.value)}
                    placeholder="Date / time (optional)"
                    disabled={isAnalyzing}
                    className="rounded-md border border-border bg-background/55 p-2.5 text-sm text-text-primary placeholder:text-text-secondary focus:border-cyan-signal focus:outline-none"
                  />
                </div>
              </section>

              {progress !== "idle" ? (
                <AnalysisProgress key={runId} status={progress} failureMessage={error} />
              ) : null}

              {error && progress === "failed" ? (
                <p className="flex items-start gap-2 rounded-md border border-red-risk/35 bg-red-risk/10 p-3 text-sm text-red-risk">
                  <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {error}
                </p>
              ) : null}
            </aside>
          </div>
        ) : (
          <motion.div initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div className="mb-6 flex justify-end">
              <Button type="button" variant="secondary" onClick={resetWorkspace}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Analyze another file
              </Button>
            </div>
            <ReportView report={report} previewFile={file} />
          </motion.div>
        )}
      </div>
    </main>
  );
}
