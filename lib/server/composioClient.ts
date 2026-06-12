import type { ComposioActionResult, ComposioActionType, TraceProofReport } from "@/types/traceproof";
import {
  getComposioConfig,
  getRenderConfig,
  isComposioGithubReady,
  isComposioNotionReady,
  isComposioSlackReady,
} from "@/lib/server/sponsorConfig";
import {
  buildGithubIssueBody,
  buildGithubIssueTitle,
  buildNotionProperties,
  buildSlackText,
} from "@/lib/sponsorReportMapper";

/**
 * Composio = action layer. Server-side only; the API key never leaves here.
 *
 * The execute base URL and tool slugs are env-configurable because Composio's
 * live catalog names change. If Composio is not configured, every action
 * returns an honest "unavailable" result — we never fake action success and
 * never fabricate a URL.
 */

const COMPOSIO_TIMEOUT_MS = Number(process.env.COMPOSIO_TIMEOUT_MS ?? 30000);

function result(
  action: ComposioActionType,
  status: ComposioActionResult["status"],
  message: string,
  url: string | null = null,
  raw: Record<string, unknown> | null = null,
): ComposioActionResult {
  return {
    provider: "Composio",
    action,
    status,
    external_url: url,
    message,
    raw,
    url,
    timestamp: new Date().toISOString(),
  };
}

/** Best-effort extraction of a result URL from a Composio response. */
function extractUrl(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  const candidates = [obj.html_url, obj.url, obj.permalink, obj.message_url, obj.page_url];
  for (const c of candidates) {
    if (typeof c === "string" && c.startsWith("http")) return c;
  }
  for (const key of ["data", "response_data", "responseData", "output", "result"]) {
    const nested = obj[key];
    if (nested && typeof nested === "object") {
      const found = extractUrl(nested);
      if (found) return found;
    }
  }
  return null;
}

function sanitizeRaw(value: unknown, depth = 0): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > 4) return null;
  const out: Record<string, unknown> = {};
  for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
    if (/api[_-]?key|token|secret|authorization|password|credential/i.test(key)) {
      out[key] = "[redacted]";
    } else if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)) {
      out[key] = sanitizeRaw(rawValue, depth + 1);
    } else if (Array.isArray(rawValue)) {
      out[key] = rawValue.slice(0, 20).map((item) =>
        item && typeof item === "object" && !Array.isArray(item) ? sanitizeRaw(item, depth + 1) : item,
      );
    } else {
      out[key] = rawValue;
    }
  }
  return out;
}

function isMissingConnection(data: Record<string, unknown> | null): boolean {
  const text = JSON.stringify(data ?? {}).toLowerCase();
  return (
    text.includes("connectedaccount") ||
    text.includes("connected account") ||
    text.includes("entity_id") ||
    text.includes("user id is required") ||
    text.includes("not connected")
  );
}

async function executeTool(
  toolSlug: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null; error: string | null }> {
  const config = getComposioConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), COMPOSIO_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/tools/execute/${toolSlug}`, {
      method: "POST",
      headers: {
        "x-api-key": config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ arguments: args }),
      signal: controller.signal,
      cache: "no-store",
    });
    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    return { ok: response.ok, status: response.status, data, error: response.ok ? null : `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, status: 0, data: null, error: error instanceof Error ? error.message : "request failed" };
  } finally {
    clearTimeout(timer);
  }
}

function reportUrl(report: TraceProofReport): string | null {
  const base = getRenderConfig().externalUrl;
  return base ? `${base.replace(/\/$/, "")}/report/current` : null;
}

export async function composioCreateGithubIssue(report: TraceProofReport): Promise<ComposioActionResult> {
  const config = getComposioConfig();
  if (!isComposioGithubReady(config)) {
    return result("github_issue", "unavailable", "Composio GitHub action is not configured or GitHub is not connected.");
  }
  const args = {
    owner: config.githubOwner,
    repo: config.githubRepo,
    title: buildGithubIssueTitle(report),
    body: buildGithubIssueBody(report),
  };
  const res = await executeTool(config.githubTool, args);
  if (!res.ok) {
    console.error("[composioClient] GitHub issue action failed:", res.error);
    if (isMissingConnection(res.data)) {
      return result(
        "github_issue",
        "unavailable",
        "Composio GitHub action is not configured or GitHub is not connected.",
        null,
        sanitizeRaw(res.data),
      );
    }
    return result("github_issue", "failed", `Composio GitHub action failed (${res.error ?? "unknown error"})`, null, sanitizeRaw(res.data));
  }
  return result("github_issue", "success", "GitHub issue created via Composio.", extractUrl(res.data), sanitizeRaw(res.data));
}

export async function composioSendSlack(report: TraceProofReport): Promise<ComposioActionResult> {
  const config = getComposioConfig();
  if (!isComposioSlackReady(config)) {
    return result("slack_summary", "unavailable", "Composio Slack action is not configured or Slack is not connected.");
  }
  const args = {
    channel: config.slackChannelId,
    text: buildSlackText(report, reportUrl(report)),
  };
  const res = await executeTool(config.slackTool, args);
  if (!res.ok) {
    console.error("[composioClient] Slack action failed:", res.error);
    return result("slack_summary", "failed", `Composio Slack action failed (${res.error ?? "unknown error"})`, null, sanitizeRaw(res.data));
  }
  return result("slack_summary", "success", "Slack forensic summary sent via Composio.", extractUrl(res.data), sanitizeRaw(res.data));
}

export async function composioSaveNotion(report: TraceProofReport): Promise<ComposioActionResult> {
  const config = getComposioConfig();
  if (!isComposioNotionReady(config)) {
    return result("notion_page", "unavailable", "Composio Notion action is not configured or Notion is not connected.");
  }
  const args = buildNotionProperties(report, config.notionDatabaseId);
  const res = await executeTool(config.notionTool, args);
  if (!res.ok) {
    console.error("[composioClient] Notion action failed:", res.error);
    return result("notion_page", "failed", `Composio Notion action failed (${res.error ?? "unknown error"})`, null, sanitizeRaw(res.data));
  }
  return result("notion_page", "success", "Report saved to Notion via Composio.", extractUrl(res.data), sanitizeRaw(res.data));
}
