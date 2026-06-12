import { NextResponse } from "next/server";
import { probeModelServerHealth, fetchModelServerModels } from "@/lib/server/modelServerClient";
import { probeAnthropicHealth } from "@/lib/server/anthropicClient";
import { checkRequiredModelReadiness } from "@/lib/server/modelReadiness";
import {
  getComposioConfig,
  getGuildConfig,
  getJuaConfig,
  getRenderConfig,
  isComposioGithubReady,
  isComposioNotionReady,
  isComposioReady,
  isComposioSlackReady,
  isJuaReady,
  isOpenUiEnabled,
  sponsorAvailability,
} from "@/lib/server/sponsorConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const [modelServer, anthropic, modelsFetch] = await Promise.all([
    probeModelServerHealth(),
    probeAnthropicHealth(),
    fetchModelServerModels(),
  ]);
  const render = getRenderConfig();
  const guild = getGuildConfig();
  const composio = getComposioConfig();
  const jua = getJuaConfig();
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
      guild: {
        enabled: guild.enabled,
        mode: "webhook",
        webhook_configured: Boolean(guild.webhookUrl),
        signing_configured: Boolean(guild.signinSecret),
      },
      composio: {
        enabled: composio.enabled,
        configured: isComposioReady(composio),
        github_configured: isComposioGithubReady(composio),
        slack_configured: isComposioSlackReady(composio),
        notion_configured: isComposioNotionReady(composio),
      },
      jua: {
        enabled: jua.enabled,
        configured: isJuaReady(jua),
      },
      openui: {
        enabled: isOpenUiEnabled(),
        safe_render_only: true,
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
