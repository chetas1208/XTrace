import type { GuildAgent } from "@/types/traceproof";
import { getGuildConfig } from "@/lib/server/sponsorConfig";

/**
 * Read-only client for the Guild AI control plane agent roster.
 *
 * `GET {apiBaseUrl}/agents?owner={owner}&limit=&offset=` returns the owner's
 * public agents with cursor-free offset pagination:
 *   { items: GuildAgentRaw[], pagination: { has_more, limit, offset, total_count } }
 *
 * Server-side only. Fully resilient: every failure degrades to an empty roster
 * with a status so the report never breaks because of Guild.
 */

const GUILD_API_TIMEOUT_MS = Number(process.env.GUILD_API_TIMEOUT_MS ?? 12000);
const PAGE_SIZE = 50;
const MAX_PAGES = 20; // hard cap (1000 agents) so a runaway pagination can't hang

export interface GuildAgentsResult {
  status: "success" | "failed" | "unavailable";
  agents: GuildAgent[];
  total: number;
  owner: string | null;
  error?: string;
}

interface GuildAgentRaw {
  id?: string;
  name?: string;
  full_name?: string;
  status?: string;
  agent_type?: string;
  description?: string | null;
  public_profile_url?: string;
  is_public?: boolean;
  installs_count?: number;
  updated_at?: string | null;
}

function normalizeAgent(raw: GuildAgentRaw): GuildAgent {
  const description = (raw.description ?? "")
    .replace(/^\s*TODO:[^\n]*$/gim, "")
    .replace(/\s+/g, " ")
    .trim();
  return {
    id: raw.id ?? "",
    name: raw.name ?? raw.full_name ?? "unknown-agent",
    full_name: raw.full_name ?? raw.name ?? "",
    status: raw.status ?? "UNKNOWN",
    agent_type: raw.agent_type ?? "",
    description,
    profile_url: raw.public_profile_url ?? "",
    is_public: raw.is_public ?? false,
    installs_count: typeof raw.installs_count === "number" ? raw.installs_count : 0,
    updated_at: raw.updated_at ?? null,
  };
}

async function fetchPage(
  baseUrl: string,
  owner: string,
  apiKey: string,
  offset: number,
  signal: AbortSignal,
): Promise<{ items: GuildAgentRaw[]; total: number; hasMore: boolean }> {
  const url = new URL(`${baseUrl.replace(/\/$/, "")}/agents`);
  if (owner) url.searchParams.set("owner", owner);
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("offset", String(offset));

  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(url, { headers, signal, cache: "no-store" });
  if (!res.ok) throw new Error(`Guild agents API responded HTTP ${res.status}`);
  const data = (await res.json()) as {
    items?: GuildAgentRaw[];
    pagination?: { has_more?: boolean; total_count?: number };
  };
  return {
    items: Array.isArray(data.items) ? data.items : [],
    total: data.pagination?.total_count ?? 0,
    hasMore: Boolean(data.pagination?.has_more),
  };
}

/**
 * Fetch every agent for the configured owner, following pagination to the end.
 * If no owner is configured, this returns the platform's public agent listing.
 */
export async function fetchGuildAgents(opts?: { owner?: string }): Promise<GuildAgentsResult> {
  const config = getGuildConfig();
  const owner = (opts?.owner ?? config.owner ?? "").trim();

  if (!config.enabled) {
    return { status: "unavailable", agents: [], total: 0, owner: owner || null, error: "Guild is disabled." };
  }
  if (!config.apiBaseUrl) {
    return {
      status: "unavailable",
      agents: [],
      total: 0,
      owner: owner || null,
      error: "Guild API base URL is not configured.",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GUILD_API_TIMEOUT_MS);

  try {
    const agents: GuildAgent[] = [];
    let total = 0;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const { items, total: pageTotal, hasMore } = await fetchPage(
        config.apiBaseUrl,
        owner,
        config.apiKey,
        page * PAGE_SIZE,
        controller.signal,
      );
      total = pageTotal || total;
      for (const item of items) agents.push(normalizeAgent(item));
      if (!hasMore || items.length === 0) break;
    }
    // Surface ready/active agents first, then by most recently updated.
    agents.sort((a, b) => {
      const ar = a.status === "READY" ? 0 : 1;
      const br = b.status === "READY" ? 0 : 1;
      if (ar !== br) return ar - br;
      return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
    });
    return { status: "success", agents, total: total || agents.length, owner: owner || null };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    console.error("[guildApiClient] fetchGuildAgents failed:", error);
    return {
      status: "failed",
      agents: [],
      total: 0,
      owner: owner || null,
      error: aborted ? "Guild agents request timed out." : "Guild agents request failed.",
    };
  } finally {
    clearTimeout(timer);
  }
}
