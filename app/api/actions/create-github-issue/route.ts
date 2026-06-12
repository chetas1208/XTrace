import { NextResponse } from "next/server";
import { composioCreateGithubIssue } from "@/lib/server/composioClient";
import { reportFromActionBody } from "@/lib/server/actionReportFromBody";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const body = await request.json().catch(() => null);
  const fromReport = reportFromActionBody(body);
  if (fromReport?.success) {
    const result = await composioCreateGithubIssue(fromReport.data);
    return NextResponse.json(result, { status: 200 });
  }

  return NextResponse.json({ status: "failed", message: "A valid report payload is required." }, { status: 400 });
}
