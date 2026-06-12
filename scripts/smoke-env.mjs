#!/usr/bin/env node
/**
 * XTrace env smoke test.
 *
 * Loads .env and live-probes every configured integration so you can confirm
 * each secret actually works end-to-end (not just that it is present). All
 * checks are read-only or non-mutating except the Guild webhook, which records
 * one clearly-labelled smoke event in the run ledger.
 *
 * Usage:  node scripts/smoke-env.mjs
 */

import { readFile } from "node:fs/promises";
import { createHmac, randomUUID } from "node:crypto";
import path from "node:path";

const ROOT = process.cwd();
const RESET = "\x1b[0m";
const C = {
  pass: (s) => `\x1b[32m${s}${RESET}`,
  fail: (s) => `\x1b[31m${s}${RESET}`,
  warn: (s) => `\x1b[33m${s}${RESET}`,
  dim: (s) => `\x1b[90m${s}${RESET}`,
  bold: (s) => `\x1b[1m${s}${RESET}`,
};

async function loadEnv() {
  const env = { ...process.env };
  try {
    const raw = await readFile(path.join(ROOT, ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in env) || env[key] === "") env[key] = value;
    }
  } catch {
    console.log(C.warn("No .env file found; using process env only."));
  }
  return env;
}

const results = [];
function record(name, status, detail) {
  results.push({ name, status, detail });
  const tag =
    status === "PASS" ? C.pass("PASS") : status === "FAIL" ? C.fail("FAIL") : status === "SKIP" ? C.dim("SKIP") : C.warn("WARN");
  console.log(`  [${tag}] ${C.bold(name.padEnd(22))} ${detail}`);
}

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

async function checkModelServer(env) {
  const base = (env.MODEL_SERVER_URL || "").replace(/\/$/, "");
  if (!base || base.includes("YOUR-CLOUDFLARE")) return record("Model server (tunnel)", "SKIP", "MODEL_SERVER_URL not set");
  const health = (env.MODEL_SERVER_HEALTH_ROUTE || "/health").trim();
  const models = (env.MODEL_SERVER_MODELS_ROUTE || "/models").trim();
  const t = withTimeout(12000);
  try {
    const h = await fetch(`${base}${health}`, { signal: t.signal, cache: "no-store" });
    const m = await fetch(`${base}${models}`, { signal: t.signal, cache: "no-store" });
    if (!h.ok) return record("Model server (tunnel)", "FAIL", `health HTTP ${h.status}`);
    const data = await m.json().catch(() => null);
    const list = Array.isArray(data) ? data : data?.models ?? [];
    const loaded = list.filter((x) => x.loaded === true || x.status === "loaded").length;
    record("Model server (tunnel)", "PASS", `health OK · ${loaded}/${list.length} models loaded`);
  } catch (e) {
    record("Model server (tunnel)", "FAIL", e.name === "AbortError" ? "timed out" : "connection failed");
  } finally {
    t.done();
  }
}

async function checkAnthropic(env) {
  const key = (env.ANTHROPIC_API_KEY || "").trim();
  if (!key) return record("Anthropic Claude", "SKIP", "ANTHROPIC_API_KEY not set");
  const model = (env.ANTHROPIC_REPORT_MODEL || "claude-sonnet-4-6").trim();
  const t = withTimeout(20000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: "user", content: "ping" }] }),
      signal: t.signal,
    });
    if (res.ok) return record("Anthropic Claude", "PASS", `key valid · model ${model}`);
    const body = await res.json().catch(() => null);
    const msg = body?.error?.message || `HTTP ${res.status}`;
    record("Anthropic Claude", res.status === 401 ? "FAIL" : "WARN", msg.slice(0, 90));
  } catch (e) {
    record("Anthropic Claude", "FAIL", e.name === "AbortError" ? "timed out" : "connection failed");
  } finally {
    t.done();
  }
}

async function checkGuild(env) {
  const enabled = (env.GUILD_ENABLED ?? "true").toLowerCase() !== "false";
  const url = (env.GUILD_WEBHOOK_URL || "").trim();
  const secret = (env.GUILD_WEBHOOK_SIGNING_SECRET || env.GUILD_SIGNIN_SECRET || "").trim();
  if (!enabled) return record("Guild webhook", "SKIP", "GUILD_ENABLED=false");
  if (!url) return record("Guild webhook", "SKIP", "GUILD_WEBHOOK_URL not set");
  const eventType = (env.GUILD_WEBHOOK_EVENT_TYPE || "xtrace.analysis.completed").trim();
  const header = (env.GUILD_WEBHOOK_SIGNATURE_HEADER || "X-Guild-Webhook-Signature").trim();
  // Guild requires the {event, action, payload} envelope, a delivery id, and an
  // HMAC-SHA256 signature over the raw body in the X-Guild-Webhook-Signature header.
  const body = JSON.stringify({
    event: "xtrace.smoke_test",
    action: "test",
    payload: { project: "XTrace", timestamp: new Date().toISOString(), note: "Env smoke test — safe to ignore." },
  });
  const headers = {
    "Content-Type": "application/json",
    "X-XTrace-Event": eventType,
    "X-Guild-Webhook-ID": randomUUID(),
  };
  if (secret) headers[header] = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  const t = withTimeout(12000);
  try {
    const res = await fetch(url, { method: "POST", headers, body, signal: t.signal, cache: "no-store" });
    if (res.ok) return record("Guild webhook", "PASS", `event delivered HTTP ${res.status}${secret ? " · signed" : " · unsigned"}`);
    record("Guild webhook", "FAIL", `HTTP ${res.status}`);
  } catch (e) {
    record("Guild webhook", "FAIL", e.name === "AbortError" ? "timed out" : "connection failed");
  } finally {
    t.done();
  }
}

async function checkComposio(env) {
  const enabled = (env.COMPOSIO_ENABLED ?? "false").toLowerCase() === "true";
  const key = (env.COMPOSIO_API_KEY || "").trim();
  if (!enabled) return record("Composio", "SKIP", "COMPOSIO_ENABLED=false");
  if (!key) return record("Composio", "SKIP", "COMPOSIO_API_KEY not set");
  const base = (env.COMPOSIO_API_BASE_URL || "https://backend.composio.dev/api/v3.1").replace(/\/$/, "");
  // Read-only auth validation — never executes a tool (would create a real issue).
  const candidates = [`${base}/toolkits?limit=1`, `${base}/tools?limit=1`, `${base}/auth_configs?limit=1`];
  const t = withTimeout(15000);
  try {
    for (const candidate of candidates) {
      const res = await fetch(candidate, { headers: { "x-api-key": key }, signal: t.signal, cache: "no-store" });
      if (res.status === 401 || res.status === 403) return record("Composio", "FAIL", `key rejected (HTTP ${res.status})`);
      if (res.ok) return record("Composio", "PASS", `key valid · ${candidate.split("/").slice(-1)[0].split("?")[0]} reachable`);
    }
    record("Composio", "WARN", "key not rejected, but no read endpoint returned 200");
  } catch (e) {
    record("Composio", "FAIL", e.name === "AbortError" ? "timed out" : "connection failed");
  } finally {
    t.done();
  }
}

async function checkJua(env) {
  const enabled = (env.JUA_ENABLED ?? "false").toLowerCase() === "true";
  const combined = (env.JUA_API_KEY || "").trim();
  const keyId = (env.JUA_API_KEY_ID || "").trim();
  const secret = (env.JUA_API_SECRET || "").trim();
  const apiKey = combined || (keyId && secret ? `${keyId}:${secret}` : "");
  if (!enabled) return record("Jua reality-context", "SKIP", "JUA_ENABLED=false");
  if (!apiKey) return record("Jua reality-context", "SKIP", "JUA credentials not set");
  const base = (env.JUA_BASE_URL || "https://query.jua.ai").replace(/\/$/, "");
  const model = (env.JUA_DEFAULT_MODEL || "ept2").trim().replace(/[-_]/g, "");
  // Real Jua API: GET /v1/forecast/ with lat/lon + variables (San Francisco here).
  const qs = new URLSearchParams({
    models: model,
    init_time: "latest",
    latitude: "37.77",
    longitude: "-122.42",
    max_prediction_timedelta: "24",
  });
  qs.append("variables", "air_temperature_at_height_level_2m");
  const t = withTimeout(25000);
  try {
    const res = await fetch(`${base}/v1/forecast/?${qs.toString()}`, {
      headers: { "X-API-Key": apiKey, Accept: "application/json" },
      signal: t.signal,
      cache: "no-store",
    });
    if (res.ok) return record("Jua reality-context", "PASS", `forecast API authorized · model ${model} (HTTP ${res.status})`);
    const detail = await res
      .json()
      .then((d) => (typeof d?.detail === "string" ? d.detail : ""))
      .catch(() => "");
    if (res.status === 403 && /plan|subscription|upgrade/i.test(detail)) {
      // Key is valid; the Jua account plan simply doesn't include API access.
      return record("Jua reality-context", "WARN", "key valid, but Jua plan lacks API access — upgrade required");
    }
    if (res.status === 401 || res.status === 403) return record("Jua reality-context", "FAIL", `credentials rejected (HTTP ${res.status})`);
    record("Jua reality-context", "WARN", `auth OK but HTTP ${res.status}${detail ? ` — ${detail.slice(0, 60)}` : ""}`);
  } catch (e) {
    record("Jua reality-context", "FAIL", e.name === "AbortError" ? "timed out" : "connection failed");
  } finally {
    t.done();
  }
}

async function main() {
  const env = await loadEnv();
  console.log(C.bold("\nXTrace env smoke test\n"));
  await checkModelServer(env);
  await checkAnthropic(env);
  await checkGuild(env);
  await checkComposio(env);
  await checkJua(env);

  const fails = results.filter((r) => r.status === "FAIL");
  const warns = results.filter((r) => r.status === "WARN");
  const passes = results.filter((r) => r.status === "PASS");
  const skips = results.filter((r) => r.status === "SKIP");
  console.log(
    `\n${C.bold("Summary:")} ${C.pass(`${passes.length} pass`)} · ${C.fail(`${fails.length} fail`)} · ${C.warn(`${warns.length} warn`)} · ${C.dim(`${skips.length} skip`)}\n`,
  );
  process.exit(fails.length > 0 ? 1 : 0);
}

main();
