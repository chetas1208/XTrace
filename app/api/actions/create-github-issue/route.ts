import { NextResponse } from "next/server";
import { composioCreateGithubIssue } from "@/lib/server/composioClient";
import { reportFromActionBody } from "@/lib/server/actionReportFromBody";
import { legacyActionInputSchema } from "@/lib/schemas";
import { getJob } from "@/lib/server/jobStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const body = await request.json().catch(() => null);
  const fromReport = reportFromActionBody(body);
  if (fromReport?.success) {
    const result = await composioCreateGithubIssue(fromReport.data);
    return NextResponse.json(result, { status: 200 });
  }

  const legacy = legacyActionInputSchema.safeParse(body);
  if (legacy.success) {
    const job = await getJob(legacy.data.jobId);
    if (job?.report) {
      const result = await composioCreateGithubIssue(job.report);
      return NextResponse.json(result, { status: 200 });
    }
  }

  return NextResponse.json({ status: "failed", message: "A valid report payload is required." }, { status: 400 });
}
