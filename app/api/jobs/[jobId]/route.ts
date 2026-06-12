import { NextResponse } from "next/server";
import { getJob } from "@/lib/server/jobStore";
import { traceProofReportSchema } from "@/lib/schemas";
import type { JobEnvelope } from "@/types/traceproof";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<NextResponse> {
  const { jobId } = await params;

  if (!jobId || jobId.length > 120) {
    return NextResponse.json({ error: "Invalid job id." }, { status: 400 });
  }

  const job = await getJob(jobId);
  if (!job) {
    // No mock reports, no sample fallback, no fabricated scores.
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  let report = job.report;
  if (report) {
    const parsed = traceProofReportSchema.safeParse(report);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Stored report did not match the report contract." },
        { status: 500 },
      );
    }
    report = parsed.data;
  }

  const envelope: JobEnvelope = {
    job_id: job.jobId,
    status: job.status,
    file_name: job.fileName,
    detected_media_type: job.detectedMediaType,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
    failure_message: job.failureMessage,
    errors: job.errors,
    report,
    feedback: job.feedback ?? [],
    actions: job.actions ?? [],
  };

  return NextResponse.json(envelope);
}
