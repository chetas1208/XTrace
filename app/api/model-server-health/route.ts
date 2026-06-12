import { NextResponse } from "next/server";
import { probeModelServerHealth } from "@/lib/server/modelServerClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Calls the model server's /health server-side and returns a simplified
 * status. The actual MODEL_SERVER_URL is never included in the response.
 */
export async function GET(): Promise<NextResponse> {
  const result = await probeModelServerHealth();
  return NextResponse.json(
    { available: result.available, status: result.status },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
