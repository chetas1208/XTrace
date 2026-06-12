import { NextResponse } from "next/server";
import { getJob, updateJob } from "@/lib/server/jobStore";
import { getJuaRealityContext } from "@/lib/server/juaClient";
import { realityContextInputSchema } from "@/lib/schemas";
import type { MediaClaim } from "@/types/traceproof";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Jua = optional reality-context agent. Server-side only.
 *
 * Runs ONLY when a weather/location/time claim is supplied (or stored on the
 * job). Returns unavailable when Jua is disabled/unconfigured, skipped when the
 * claim is not reality-context relevant, and success/failed otherwise. It is
 * plausibility checking — never proof the media is real or fake.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const parsed = realityContextInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ status: "failed", message: "A valid jobId is required." }, { status: 400 });
  }

  const { jobId } = parsed.data;
  const job = await getJob(jobId);
  if (!job) {
    return NextResponse.json({ status: "failed", message: "Job not found." }, { status: 404 });
  }

  // Prefer claim fields from the request; fall back to the claim stored at upload.
  const stored = job.mediaClaim;
  const claim: MediaClaim = {
    claim: (parsed.data.claim ?? stored?.claim ?? "").trim(),
    location: (parsed.data.location ?? stored?.location ?? "") || null,
    datetime: (parsed.data.datetime ?? stored?.datetime ?? "") || null,
  };

  const signal = await getJuaRealityContext(claim);

  // Persist the reality-context result onto the stored report so it survives reloads.
  if (job.report) {
    await updateJob(jobId, {
      report: { ...job.report, reality_context: signal, media_claim: job.report.media_claim ?? claim },
      mediaClaim: stored ?? claim,
    });
  }

  return NextResponse.json(signal, { status: 200 });
}
