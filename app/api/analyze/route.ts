import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { generateClaudeXTraceSummary } from "@/lib/server/anthropicClient";
import { sendGuildAnalysisEvent, XTRACE_AGENT_PLAN } from "@/lib/server/guildWebhookClient";
import { getJuaRealityContext } from "@/lib/server/juaClient";
import { detectMediaType, sanitizeFileName } from "@/lib/server/mediaDetection";
import {
  analyzeMediaViaTunnel,
  fetchModelServerModels,
  probeModelServerHealth,
  userFacingModelServerError,
} from "@/lib/server/modelServerClient";
import {
  checkRequiredModelReadiness,
  toModelReadiness,
  validatePostAnalysisModelPolicy,
} from "@/lib/server/modelReadiness";
import { buildSponsorStatuses } from "@/lib/server/sponsorConfig";
import { deleteTempUpload, saveTempUpload } from "@/lib/server/tempUpload";
import { mapAnalysisResponseToReport } from "@/lib/reportMapper";
import { traceProofReportSchema } from "@/lib/schemas";
import { baseFromExtension, MAX_UPLOAD_BYTES, UNSUPPORTED_FILE_MESSAGE } from "@/lib/utils";
import type { AnalyzeResponse, MediaClaim, ModelServerAnalysisResponse } from "@/types/traceproof";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

function maxUploadBytes(): number {
  return process.env.MODEL_SERVER_MAX_UPLOAD_MB
    ? Number(process.env.MODEL_SERVER_MAX_UPLOAD_MB) * 1024 * 1024
    : MAX_UPLOAD_BYTES;
}

function requireRealModelServer(): boolean {
  const v = process.env.XTRACE_REQUIRE_REAL_MODEL_SERVER;
  return v === undefined ? true : v.toLowerCase() === "true" || v === "1";
}

function containsDisallowedVendor(value: string): boolean {
  return /\bnvidia\b/i.test(value);
}

function enforceNoDisallowedVendorSignals(response: ModelServerAnalysisResponse): ModelServerAnalysisResponse {
  const disallowedScoring = response.signals.filter(
    (signal) =>
      containsDisallowedVendor(signal.model_name) &&
      signal.status === "success" &&
      (signal.score !== null || signal.confidence !== null),
  );
  if (disallowedScoring.length > 0) {
    throw new Error("Disallowed vendor model signal returned by model server.");
  }

  return {
    ...response,
    signals: response.signals.filter((signal) => !containsDisallowedVendor(signal.model_name)),
    fusion: {
      ...response.fusion,
      strongest_evidence: response.fusion.strongest_evidence.filter((item) => !containsDisallowedVendor(item)),
      limitations: response.fusion.limitations.filter((item) => !containsDisallowedVendor(item)),
    },
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  let tempDir: string | null = null;
  const analysisId = `xtrace_${randomUUID()}`;
  const createdAt = new Date().toISOString();

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ status: "failed", error: "A non-empty media file is required." }, { status: 400 });
    }

    const limit = maxUploadBytes();
    if (file.size > limit) {
      return NextResponse.json(
        { status: "failed", error: `File is too large. Maximum size is ${Math.floor(limit / (1024 * 1024))} MB.` },
        { status: 413 },
      );
    }

    const fileName = sanitizeFileName(String(formData.get("file_name") || file.name));
    const mimeType = file.type || "application/octet-stream";

    const claimText = String(formData.get("claim") || "").trim();
    const claimLocation = String(formData.get("location") || "").trim();
    const claimDatetime = String(formData.get("datetime") || "").trim();
    const mediaClaim: MediaClaim | null =
      claimText || claimLocation || claimDatetime
        ? { claim: claimText, location: claimLocation || null, datetime: claimDatetime || null }
        : null;

    const extBucket = baseFromExtension(fileName);
    const mimeBucket = mimeType.startsWith("image/")
      ? "image"
      : mimeType.startsWith("audio/")
        ? "audio"
        : mimeType.startsWith("video/")
          ? "video"
          : null;
    if (!extBucket && !mimeBucket) {
      return NextResponse.json({ status: "failed", error: UNSUPPORTED_FILE_MESSAGE }, { status: 415 });
    }

    if (requireRealModelServer() && !process.env.MODEL_SERVER_URL) {
      return NextResponse.json(
        { status: "failed", error: "Model server URL is not configured." },
        { status: 503 },
      );
    }

    const health = await probeModelServerHealth();
    if (requireRealModelServer() && !health.available) {
      return NextResponse.json(
        { status: "failed", error: "GPU model server is unavailable through tunnel." },
        { status: 503 },
      );
    }

    const modelsFetch = await fetchModelServerModels();
    const preReadiness = toModelReadiness(
      checkRequiredModelReadiness({
        modelServerModelsResponse: modelsFetch.data,
        detectedMediaType: extBucket ?? mimeBucket ?? undefined,
      }),
    );

    const { filePath, tempDir: dir } = await saveTempUpload(file, fileName);
    tempDir = dir;

    const detected = await detectMediaType({ fileName, mimeType, filePath });
    if (detected === "unsupported") {
      return NextResponse.json({ status: "failed", error: UNSUPPORTED_FILE_MESSAGE }, { status: 415 });
    }

    const modalityReadiness = toModelReadiness(
      checkRequiredModelReadiness({
        modelServerModelsResponse: modelsFetch.data,
        detectedMediaType: detected,
      }),
    );

    if (
      (process.env.XTRACE_STRICT_GPU_MODELS ?? "true").toLowerCase() === "true" &&
      !modalityReadiness.ready &&
      modelsFetch.ok
    ) {
      const body: AnalyzeResponse = {
        status: "failed",
        error: "Required GPU models are not ready",
        model_readiness: modalityReadiness,
      };
      return NextResponse.json(body, { status: 503 });
    }

    const response = enforceNoDisallowedVendorSignals(
      await analyzeMediaViaTunnel({ filePath, fileName, mimeType }),
    );

    const postReadiness = toModelReadiness(
      validatePostAnalysisModelPolicy({ response, preReadiness: modalityReadiness }),
    );

    if ((process.env.REQUIRED_MODELS_STRICT ?? "true").toLowerCase() === "true" && !postReadiness.ready) {
      const body: AnalyzeResponse = {
        status: "failed",
        error: "Required GPU models are not ready",
        model_readiness: postReadiness,
      };
      return NextResponse.json(body, { status: 503 });
    }

    const juaContext = await getJuaRealityContext({
      claim: mediaClaim?.claim ?? null,
      location: mediaClaim?.location ?? null,
      datetime: mediaClaim?.datetime ?? null,
    });

    const reasoning = await generateClaudeXTraceSummary({
      fileName,
      detectedMediaType: response.media_type ?? detected,
      modelServerResponse: response,
      modelReadiness: postReadiness,
      juaContext: juaContext ?? undefined,
      optionalClaim: mediaClaim
        ? { claim: mediaClaim.claim, location: mediaClaim.location ?? undefined, datetime: mediaClaim.datetime ?? undefined }
        : undefined,
    });

    const draftReport = mapAnalysisResponseToReport({
      jobId: analysisId,
      createdAt,
      detectedMediaType: detected,
      response,
      reasoning,
      mediaClaim,
      modelReadiness: postReadiness,
      realityContext: juaContext,
      agentSteps: reasoning.agent_steps ?? [],
    });

    const guildWebhook = await sendGuildAnalysisEvent({
      report: draftReport,
      modelServerResponse: response,
      claudeSummary: reasoning,
      juaContext,
      agentPlan: XTRACE_AGENT_PLAN,
    });

    const sponsorStatuses = buildSponsorStatuses({
      guildWebhookStatus: guildWebhook.status,
      juaStatus: juaContext?.status ?? "skipped",
      anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
      anthropicStatus: reasoning.reasoning_layer.status,
    });

    const report = {
      ...draftReport,
      guild_webhook: guildWebhook,
      sponsor_statuses: sponsorStatuses,
    };

    const validated = traceProofReportSchema.safeParse(report);
    if (!validated.success) {
      console.error("[/api/analyze] report validation failed:", validated.error.flatten());
      return NextResponse.json(
        { status: "failed", error: "Generated report did not match the report contract." },
        { status: 500 },
      );
    }

    const body: AnalyzeResponse = { status: "completed", report: validated.data };
    return NextResponse.json(body, { status: 200 });
  } catch (error) {
    const message = userFacingModelServerError(error);
    return NextResponse.json({ status: "failed", error: message }, { status: 500 });
  } finally {
    await deleteTempUpload(tempDir);
  }
}
