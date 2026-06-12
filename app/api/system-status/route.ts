import { NextResponse } from "next/server";
import { probeModelServerHealth, fetchModelServerModels } from "@/lib/server/modelServerClient";
import { probeAnthropicHealth } from "@/lib/server/anthropicClient";
import { checkRequiredModelReadiness } from "@/lib/server/modelReadiness";
import { getRenderConfig, sponsorAvailability } from "@/lib/server/sponsorConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const [modelServer, anthropic, modelsFetch] = await Promise.all([
    probeModelServerHealth(),
    probeAnthropicHealth(),
    fetchModelServerModels(),
  ]);
  const render = getRenderConfig();
  const readiness = checkRequiredModelReadiness({ modelServerModelsResponse: modelsFetch.data });

  return NextResponse.json(
    {
      app: {
        name: "XTrace",
        theme: "web-agent",
        deployment: "Render",
        status: "online",
        env: render.env,
      },
      model_server: {
        configured: Boolean(process.env.MODEL_SERVER_URL),
        available: modelServer.available,
        models_ready: readiness.ready,
        strict_required_models: (process.env.REQUIRED_MODELS_STRICT ?? "true").toLowerCase() === "true",
        health: modelServer.available ? "healthy" : "unavailable",
        models_route_ok: modelServer.models_route_ok,
      },
      anthropic: {
        configured: anthropic.configured,
        available: anthropic.available,
        model: anthropic.model,
        fallback_model: anthropic.fallback_model,
      },
      anthropic_reasoning: {
        configured: anthropic.configured,
        available: anthropic.available,
        provider: anthropic.provider,
        model: anthropic.model,
        fallback_model: anthropic.fallback_model,
      },
      sponsors: sponsorAvailability(),
      timestamp: new Date().toISOString(),
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
