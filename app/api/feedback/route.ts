import { NextResponse } from "next/server";
import { getJob, updateJob } from "@/lib/server/jobStore";
import { feedbackInputSchema } from "@/lib/schemas";
import type { FeedbackRecord } from "@/types/traceproof";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Local reviewer review panel.
 *
 * Reviewer feedback is saved locally with the job (in-memory + disk mirror).
 * XTrace improves through human review; this captures high-signal failure data
 * for future model evaluation without blocking the user.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const parsed = feedbackInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { status: "failed", message: "A valid jobId and rating are required." },
      { status: 400 },
    );
  }

  const { jobId, rating, comment } = parsed.data;
  const job = await getJob(jobId);
  if (!job) {
    return NextResponse.json({ status: "failed", message: "Job not found." }, { status: 404 });
  }

  const record: FeedbackRecord = {
    rating,
    comment: comment ?? null,
    timestamp: new Date().toISOString(),
  };

  await updateJob(jobId, { feedback: [...(job.feedback ?? []), record] });

  return NextResponse.json({ status: "saved", message: "Feedback saved for local review.", record }, { status: 200 });
}
