import Anthropic from "@anthropic-ai/sdk";
import { buildDeterministicReasoning, dedupe } from "@/lib/reportMapper";
import { claudeReasoningSchema } from "@/lib/schemas";
import type {
  AgentStep,
  ClaudeXTraceSummary,
  JuaRealityContext,
  ModelReadiness,
  ModelServerAnalysisResponse,
  ReasoningSummary,
  ReasoningLayerStatus,
  SponsorTrace,
  XTraceUIBlock,
} from "@/types/traceproof";

/**
 * Server-side client for the Anthropic Claude forensic reasoning layer.
 *
 * Role: REPORT WRITER ONLY. It summarizes the real detector evidence the HPC
 * GPU server produced. It must never run in the browser, never expose the API
 * key, never create or alter detector scores, and never claim "fake"/"real".
 *
 * Resilience: primary model -> fallback model -> deterministic fallback. This
 * function never throws; it always returns a usable reasoning result.
 */

const PROVIDER = "Anthropic Claude";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_FALLBACK_MODEL = "claude-haiku-4-5";

const ANTHROPIC_UNAVAILABLE_LIMITATION =
  "Anthropic reasoning layer unavailable; report text generated deterministically from model signals.";

const SYSTEM_PROMPT =
  "You are XTrace's forensic web-agent report writer. You are not a detector. You summarize only real evidence " +
  "provided by GPU-hosted models, provenance tools, and sponsor tool statuses. You must not invent detector scores, " +
  "model names, metadata, timestamps, provenance facts, Guild events, Composio actions, Jua weather results, or file " +
  "properties. You must never say the media is fake or real with certainty. Use careful language: unknown provenance, " +
  "synthetic-media risk indicators, model-backed signal, requires human review, not definitive. If models are " +
  "unavailable, explicitly list that as a limitation. Preserve risk score, confidence, label, and model signals exactly. " +
  "Write clean, readable prose: never use em dashes or en dashes, and never use a spaced hyphen as a dash; " +
  "use commas, semicolons, or separate sentences instead.\n\n" +
  "Respond with ONLY a single valid JSON object (no markdown, no code fences, no prose) of this exact shape:\n" +
  '{"summary": string, "strongest_evidence": string[], "weakest_evidence": string[], "limitations": string[], ' +
  '"human_action": string, "confidence_rationale": string, "agent_steps": [{"name": string, "status": ' +
  '"success|failed|skipped|unavailable", "description": string}], "openui_blocks": [{"type": ' +
  '"risk_summary|signal_cluster|limitation|action|sponsor_trace|reality_context|model_readiness", "title": string, ' +
  '"severity": "low|medium|high|neutral", "content": string, "items": string[]}]}';

type ReasoningTextFields = Omit<ReasoningSummary, "reasoning_layer"> & { agent_steps: AgentStep[] };

function buildEvidencePayload(params: {
  fileName: string;
  detectedMediaType: string;
  modelServerResponse: ModelServerAnalysisResponse;
  modelReadiness?: ModelReadiness;
  juaContext?: JuaRealityContext;
  sponsorTrace?: SponsorTrace;
  optionalClaim?: { claim?: string; location?: string; datetime?: string };
}) {
  const r = params.modelServerResponse;
  return {
    file_name: params.fileName,
    detected_media_type: params.detectedMediaType,
    fusion: {
      risk_score: r.fusion.risk_score,
      confidence: r.fusion.confidence,
      label: r.fusion.label,
      strongest_evidence: r.fusion.strongest_evidence,
      limitations: r.fusion.limitations,
    },
    signals: r.signals.map((s) => ({
      model_name: s.model_name,
      modality: s.modality,
      status: s.status,
      score: s.score,
      confidence: s.confidence,
      label: s.label,
      evidence: s.evidence,
      limitations: s.limitations,
      device: s.device,
    })),
    model_readiness: params.modelReadiness ?? null,
    jua_context: params.juaContext ?? null,
    sponsor_trace: params.sponsorTrace ?? null,
    optional_media_claim: params.optionalClaim ?? null,
  };
}

/** Pull a JSON object out of a model message that may contain fences/prose. */
function extractJson(content: string): unknown | null {
  let cleaned = content.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) cleaned = fence[1].trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Fall through to brace extraction.
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      // Fall through to truncation repair.
    }
  }

  // Best-effort repair for a response that was cut off mid-object: balance any
  // unclosed strings/brackets so the leading (complete) fields still parse.
  if (start !== -1) {
    const repaired = balanceJson(cleaned.slice(start));
    if (repaired) {
      try {
        return JSON.parse(repaired);
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Close any unterminated string/array/object so a truncated JSON object parses. */
function balanceJson(input: string): string | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let lastSafe = -1;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") stack.pop();
    // Remember a position where the structure is balanced after a complete value.
    if (!inString && stack.length >= 1 && (ch === "}" || ch === "]" || ch === '"' || /[0-9eltruefalsn]/i.test(ch))) {
      lastSafe = i;
    }
  }
  if (stack.length === 0) return null;
  let body = input;
  if (inString) body = body.slice(0, lastSafe + 1); // drop a half-written string value
  // Trim a dangling trailing comma or partial key before closing.
  body = body.replace(/,\s*("[^"]*)?$/s, "");
  const closers = [...stack].reverse().join("");
  return body + closers;
}

function coerceFields(parsed: unknown): ReasoningTextFields | null {
  const result = claudeReasoningSchema.safeParse(parsed);
  if (!result.success) return null;
  const data = result.data;
  if (!data.summary.trim() || !data.human_action.trim()) return null;
  const blocks = data.openui_blocks.length ? data.openui_blocks : data.report_blocks;
  return {
    summary: data.summary.trim(),
    strongest_evidence: data.strongest_evidence,
    weakest_evidence: data.weakest_evidence,
    limitations: data.limitations,
    human_action: data.human_action.trim(),
    confidence_rationale: data.confidence_rationale,
    report_blocks: blocks as XTraceUIBlock[],
    agent_steps: data.agent_steps,
  };
}

function defaultAgentSteps(modelReadiness?: ModelReadiness): AgentStep[] {
  return [
    { name: "Intake Agent", status: "success", description: "Media file received and validated." },
    { name: "Media Router", status: "success", description: "Media type routed to GPU forensic pipeline." },
    { name: "Cloudflare Tunnel", status: "success", description: "Secure transport to HPC model server." },
    {
      name: "GPU Forensics",
      status: modelReadiness?.ready ? "success" : "unavailable",
      description: modelReadiness?.message ?? "GPU model inference completed.",
    },
    { name: "Jua Reality Context", status: "skipped", description: "Weather/location/time context checked only when relevant." },
    { name: "Claude Reasoning", status: "success", description: "Evidence summarized by Anthropic Claude." },
    { name: "Guild Webhook", status: "skipped", description: "Guild event dispatch follows report generation." },
    { name: "XTrace Report", status: "success", description: "Structured forensic report assembled." },
  ];
}

async function callClaudeModel(params: {
  client: Anthropic;
  model: string;
  evidenceJson: string;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
}): Promise<ReasoningTextFields> {
  const message = await params.client.messages.create(
    {
      model: params.model,
      max_tokens: params.maxTokens,
      temperature: params.temperature,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content:
            "Create a JSON forensic report summary from this XTrace model evidence. Use only this evidence; " +
            "do not invent anything.\n\n" +
            params.evidenceJson,
        },
      ],
    },
    { timeout: params.timeoutMs },
  );

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  const fields = coerceFields(extractJson(text));
  if (!fields) {
    throw new Error("Claude returned non-JSON or incomplete content");
  }
  return fields;
}

/** Union the model's limitations with the deterministic ones (never drop a real limitation). */
const LIMITATION_STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "of", "to", "and", "or", "not", "for", "this",
  "that", "with", "from", "by", "in", "on", "its", "it", "be", "as", "no", "was",
  "were", "but", "so", "one", "any", "all", "should", "before", "after",
]);

function significantTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !LIMITATION_STOPWORDS.has(w)),
  );
}

/** Fraction of `subset`'s significant tokens that also appear in `superset`. */
function coverage(subset: Set<string>, superset: Set<string>): number {
  if (subset.size === 0) return 0;
  let common = 0;
  for (const t of subset) if (superset.has(t)) common += 1;
  return common / subset.size;
}

/**
 * Prefer the (richer) model limitations and only append deterministic ones that
 * are not already semantically covered, so the UI shows one clean list instead
 * of near-duplicate pairs.
 */
function mergeLimitations(modelLimits: string[], deterministicLimits: string[]): string[] {
  const base = dedupe(modelLimits.filter(Boolean));
  if (base.length === 0) return dedupe(deterministicLimits.filter(Boolean));
  const baseTokens = base.map(significantTokens);
  const extra: string[] = [];
  for (const limit of deterministicLimits) {
    if (!limit) continue;
    const tokens = significantTokens(limit);
    const covered = baseTokens.some((bt) => coverage(tokens, bt) >= 0.5);
    if (!covered) extra.push(limit);
  }
  return dedupe([...base, ...extra]);
}

function mergeWithDeterministic(model: ReasoningTextFields, deterministic: ReasoningTextFields): ReasoningTextFields {
  return {
    summary: model.summary || deterministic.summary,
    human_action: model.human_action || deterministic.human_action,
    strongest_evidence: model.strongest_evidence.length ? model.strongest_evidence : deterministic.strongest_evidence,
    weakest_evidence: model.weakest_evidence.length ? model.weakest_evidence : deterministic.weakest_evidence,
    limitations: mergeLimitations(model.limitations, deterministic.limitations),
    confidence_rationale: model.confidence_rationale || deterministic.confidence_rationale,
    report_blocks: model.report_blocks.length ? model.report_blocks : deterministic.report_blocks,
    agent_steps: model.agent_steps.length ? model.agent_steps : deterministic.agent_steps ?? [],
  };
}

export async function generateClaudeXTraceSummary(params: {
  fileName: string;
  detectedMediaType: string;
  modelServerResponse: ModelServerAnalysisResponse;
  modelReadiness?: ModelReadiness;
  juaContext?: JuaRealityContext;
  sponsorTrace?: SponsorTrace;
  optionalClaim?: { claim?: string; location?: string; datetime?: string };
}): Promise<ClaudeXTraceSummary> {
  if (typeof window !== "undefined") {
    throw new Error("generateClaudeXTraceSummary must only run on the server.");
  }

  const deterministic = {
    ...buildDeterministicReasoning(params.modelServerResponse),
    agent_steps: defaultAgentSteps(params.modelReadiness),
  };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const primaryModel = process.env.ANTHROPIC_REPORT_MODEL ?? DEFAULT_MODEL;
  const fallbackModel = process.env.ANTHROPIC_REPORT_FALLBACK_MODEL ?? DEFAULT_FALLBACK_MODEL;
  // High-quality model is only used when explicitly configured.
  const highQualityModel = process.env.ANTHROPIC_HIGH_QUALITY_MODEL;
  const useHighQuality = (process.env.ANTHROPIC_USE_HIGH_QUALITY ?? "").toLowerCase() === "true";
  const effectivePrimary = useHighQuality && highQualityModel ? highQualityModel : primaryModel;

  const timeoutMs = Number(process.env.ANTHROPIC_TIMEOUT_MS ?? 120000);
  // Large enough that the full JSON report (summary + evidence + blocks) never
  // truncates mid-object; truncated JSON would fail parsing and force a fallback.
  const maxTokens = Number(process.env.ANTHROPIC_MAX_TOKENS ?? 4096);
  const temperature = Number(process.env.ANTHROPIC_TEMPERATURE ?? 0.2);

  const finalize = (
    fields: ReasoningTextFields,
    status: ReasoningLayerStatus,
    model: string | null,
    note: string,
  ): ClaudeXTraceSummary => ({
    ...fields,
    agent_steps: fields.agent_steps?.length ? fields.agent_steps : defaultAgentSteps(params.modelReadiness),
    openui_blocks: fields.report_blocks,
    reasoning_layer: { provider: PROVIDER, model, status, note },
  });

  const deterministicResult = (note: string): ClaudeXTraceSummary =>
    finalize(
      { ...deterministic, limitations: dedupe([...deterministic.limitations, ANTHROPIC_UNAVAILABLE_LIMITATION]) },
      "unavailable",
      null,
      note,
    );

  if (!apiKey) {
    return deterministicResult(
      "Anthropic reasoning layer not configured (no API key); report text generated deterministically from model signals.",
    );
  }

  const client = new Anthropic({ apiKey });
  const evidenceJson = JSON.stringify(buildEvidencePayload(params), null, 2);

  // Primary (or high-quality) model.
  try {
    const fields = await callClaudeModel({ client, model: effectivePrimary, evidenceJson, maxTokens, temperature, timeoutMs });
    return finalize(
      mergeWithDeterministic(fields, deterministic),
      "success",
      effectivePrimary,
      "Claude summarizes evidence only. It does not perform detection or modify model scores.",
    );
  } catch (primaryError) {
    console.error(`[anthropicClient] primary model '${effectivePrimary}' failed:`, primaryError);
  }

  // Fallback model.
  if (fallbackModel && fallbackModel !== effectivePrimary) {
    try {
      const fields = await callClaudeModel({ client, model: fallbackModel, evidenceJson, maxTokens, temperature, timeoutMs });
      return finalize(
        mergeWithDeterministic(fields, deterministic),
        "fallback_used",
        fallbackModel,
        "Primary Claude model was unavailable; fallback model summarized the evidence. It does not perform detection.",
      );
    } catch (fallbackError) {
      console.error(`[anthropicClient] fallback model '${fallbackModel}' failed:`, fallbackError);
    }
  }

  return deterministicResult(ANTHROPIC_UNAVAILABLE_LIMITATION);
}

/** Server-side Anthropic reachability probe for /api/system-status. Never throws, never leaks the key. */
export async function probeAnthropicHealth(): Promise<{
  configured: boolean;
  available: boolean;
  provider: string;
  model: string;
  fallback_model: string;
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_REPORT_MODEL ?? DEFAULT_MODEL;
  const fallback_model = process.env.ANTHROPIC_REPORT_FALLBACK_MODEL ?? DEFAULT_FALLBACK_MODEL;

  if (!apiKey) {
    return { configured: false, available: false, provider: "Anthropic", model, fallback_model };
  }

  // By default we report "ready" from configuration without spending tokens on
  // every status poll. Set ANTHROPIC_HEALTH_PING=true to do a real 1-token check.
  if ((process.env.ANTHROPIC_HEALTH_PING ?? "").toLowerCase() !== "true") {
    return { configured: true, available: true, provider: "Anthropic", model, fallback_model };
  }
  try {
    const client = new Anthropic({ apiKey });
    await client.messages.create(
      { model, max_tokens: 1, messages: [{ role: "user", content: "ping" }] },
      { timeout: 8000 },
    );
    return { configured: true, available: true, provider: "Anthropic", model, fallback_model };
  } catch {
    return { configured: true, available: false, provider: "Anthropic", model, fallback_model };
  }
}
