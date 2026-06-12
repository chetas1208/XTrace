/**
 * Central server-side reader for sponsor-tool configuration (XTrace).
 *
 * Server-side only. The returned config objects DO contain secrets (API keys),
 * so they must never be sent to the browser. Use `sponsorAvailability()` for
 * the safe, secret-free summary that /api/system-status returns.
 */

function flag(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true" || value === "1";
}

function trimmed(value: string | undefined): string {
  return (value ?? "").trim();
}

// --- Guild (agent/session run ledger) ---------------------------------------

export interface GuildConfig {
  enabled: boolean;
  webhookUrl: string;
  signinSecret: string;
  webhookSigningSecret: string;
  webhookSignatureHeader: string;
  webhookEventType: string;
}

export function getGuildConfig(): GuildConfig {
  const signinSecret =
    trimmed(process.env.GUILD_WEBHOOK_SIGNING_SECRET) || trimmed(process.env.GUILD_SIGNIN_SECRET);
  return {
    enabled: flag(process.env.GUILD_ENABLED, true),
    webhookUrl: trimmed(process.env.GUILD_WEBHOOK_URL),
    signinSecret,
    webhookSigningSecret: signinSecret,
    webhookSignatureHeader: trimmed(process.env.GUILD_WEBHOOK_SIGNATURE_HEADER) || "X-Guild-Webhook-Signature",
    webhookEventType: trimmed(process.env.GUILD_WEBHOOK_EVENT_TYPE) || "xtrace.analysis.completed",
  };
}

/** Guild can record a run via an inbound webhook; HMAC signing is used when configured. */
export function isGuildWebhookReady(config = getGuildConfig()): boolean {
  return config.enabled && Boolean(config.webhookUrl);
}

// --- Composio (action layer) ------------------------------------------------

export interface ComposioConfig {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  githubOwner: string;
  githubRepo: string;
  slackChannelId: string;
  githubTool: string;
  slackTool: string;
  notionDatabaseId: string;
  notionTool: string;
}

export function getComposioConfig(): ComposioConfig {
  return {
    enabled: flag(process.env.COMPOSIO_ENABLED, false),
    apiKey: trimmed(process.env.COMPOSIO_API_KEY),
    baseUrl: trimmed(process.env.COMPOSIO_API_BASE_URL) || "https://backend.composio.dev/api/v3.1",
    githubOwner: trimmed(process.env.COMPOSIO_GITHUB_OWNER),
    githubRepo: trimmed(process.env.COMPOSIO_GITHUB_REPO),
    slackChannelId: trimmed(process.env.COMPOSIO_SLACK_CHANNEL_ID),
    githubTool: trimmed(process.env.COMPOSIO_GITHUB_CREATE_ISSUE_TOOL) || "GITHUB_CREATE_AN_ISSUE",
    slackTool: trimmed(process.env.COMPOSIO_SLACK_SEND_MESSAGE_TOOL) || "SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL",
    notionDatabaseId: trimmed(process.env.COMPOSIO_NOTION_DATABASE_ID),
    notionTool: trimmed(process.env.COMPOSIO_NOTION_CREATE_PAGE_TOOL) || "NOTION_CREATE_NOTION_PAGE",
  };
}

export function isComposioGithubReady(config = getComposioConfig()): boolean {
  return config.enabled && Boolean(config.apiKey) && Boolean(config.githubOwner) && Boolean(config.githubRepo) && Boolean(config.githubTool);
}

export function isComposioSlackReady(config = getComposioConfig()): boolean {
  return config.enabled && Boolean(config.apiKey) && Boolean(config.slackChannelId) && Boolean(config.slackTool);
}

export function isComposioNotionReady(config = getComposioConfig()): boolean {
  return config.enabled && Boolean(config.apiKey) && Boolean(config.notionDatabaseId) && Boolean(config.notionTool);
}

export function isComposioReady(config = getComposioConfig()): boolean {
  return isComposioGithubReady(config) || isComposioSlackReady(config) || isComposioNotionReady(config);
}

// --- Jua (optional reality-context) -----------------------------------------

export interface JuaConfig {
  enabled: boolean;
  keyId: string;
  apiSecret: string;
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
}

export function getJuaConfig(): JuaConfig {
  const keyId = trimmed(process.env.JUA_API_KEY_ID);
  const apiSecret = trimmed(process.env.JUA_API_SECRET);
  const combinedKey = trimmed(process.env.JUA_API_KEY);
  return {
    enabled: flag(process.env.JUA_ENABLED, false),
    keyId: keyId || (combinedKey.includes(":") ? combinedKey.split(":")[0] : combinedKey),
    apiSecret: apiSecret || (combinedKey.includes(":") ? combinedKey.split(":").slice(1).join(":") : ""),
    apiKey: combinedKey,
    baseUrl: trimmed(process.env.JUA_BASE_URL) || "https://query.jua.ai",
    defaultModel: trimmed(process.env.JUA_DEFAULT_MODEL) || "ept-2",
  };
}

export function isJuaReady(config = getJuaConfig()): boolean {
  if (!config.enabled) return false;
  if (config.apiKey && !config.apiKey.includes(":")) return Boolean(config.apiKey);
  return Boolean(config.keyId) && Boolean(config.apiSecret);
}

// --- Render (deployment) ----------------------------------------------------

export interface RenderConfig {
  serviceName: string;
  env: string;
  externalUrl: string;
}

export function getRenderConfig(): RenderConfig {
  return {
    serviceName: trimmed(process.env.RENDER_SERVICE_NAME) || "xtrace",
    env: trimmed(process.env.RENDER_ENV) || trimmed(process.env.NODE_ENV) || "production",
    externalUrl: trimmed(process.env.RENDER_EXTERNAL_URL),
  };
}

// --- OpenUI (dynamic report blocks) -----------------------------------------

export function isOpenUiEnabled(): boolean {
  // Dynamic report blocks are built-in; default on unless explicitly disabled.
  return flag(process.env.OPENUI_ENABLED, true);
}

/**
 * Secret-free sponsor availability summary for /api/system-status. "available"
 * means "configured and ready" — no live network probe, no keys, no URLs.
 */
export function sponsorAvailability() {
  const guild = getGuildConfig();
  const composio = getComposioConfig();
  const jua = getJuaConfig();
  const guildWebhookConfigured = isGuildWebhookReady(guild);

  return {
    render: { enabled: true, role: "hosts public web agent" },
    guild: {
      enabled: guild.enabled,
      configured: guildWebhookConfigured,
      mode: "webhook",
      webhook_configured: Boolean(guild.webhookUrl),
      signing_configured: Boolean(guild.signinSecret),
      role: "agent/session event trace",
    },
    composio: {
      enabled: composio.enabled,
      configured: isComposioReady(composio),
      github_configured: isComposioGithubReady(composio),
      slack_configured: isComposioSlackReady(composio),
      notion_configured: isComposioNotionReady(composio),
      role: "external actions",
    },
    jua: {
      enabled: jua.enabled,
      configured: isJuaReady(jua),
      role: "optional weather/location context",
    },
    openui: {
      enabled: isOpenUiEnabled(),
      role: "dynamic report blocks",
    },
  };
}

export function buildSponsorStatuses(params: {
  guildWebhookStatus: "success" | "failed" | "unavailable" | "skipped";
  juaStatus: "success" | "failed" | "unavailable" | "skipped";
  anthropicConfigured: boolean;
  anthropicStatus: "success" | "fallback_used" | "unavailable";
}) {
  const guild = getGuildConfig();
  const composio = getComposioConfig();
  const jua = getJuaConfig();
  const guildStatus =
    params.guildWebhookStatus === "skipped" ? "unavailable" : params.guildWebhookStatus;
  return {
    render: { enabled: true, role: "hosts public web agent" },
    guild: {
      enabled: guild.enabled,
      configured: isGuildWebhookReady(guild),
      status: guildStatus,
      mode: "webhook",
    },
    composio: { enabled: composio.enabled, configured: isComposioReady(composio) },
    openui: { enabled: isOpenUiEnabled() },
    jua: { enabled: jua.enabled, status: params.juaStatus },
    anthropic: { configured: params.anthropicConfigured, status: params.anthropicStatus },
  };
}
