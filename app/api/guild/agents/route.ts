import { NextRequest, NextResponse } from "next/server";
import { fetchGuildAgents } from "@/lib/server/guildApiClient";
import { getGuildConfig } from "@/lib/server/sponsorConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/guild/agents[?owner=chetas]
 * Fetches every Guild AI agent for the configured (or requested) owner,
 * following pagination to the end. Read-only.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const ownerParam = request.nextUrl.searchParams.get("owner")?.trim() || undefined;
  const config = getGuildConfig();
  const result = await fetchGuildAgents({ owner: ownerParam });

  const httpStatus = result.status === "failed" ? 502 : 200;
  return NextResponse.json(
    {
      status: result.status,
      owner: result.owner ?? config.owner ?? null,
      total: result.total,
      count: result.agents.length,
      agents: result.agents,
      ...(result.error ? { error: result.error } : {}),
      timestamp: new Date().toISOString(),
    },
    { status: httpStatus, headers: { "Cache-Control": "no-store" } },
  );
}
