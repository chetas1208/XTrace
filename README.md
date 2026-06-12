# XTrace

**XTrace: Web Agent for Multimodal Media Forensics**

> Follow the signal. Verify the source.

XTrace is a **web agent** for multimodal media forensics. It accepts an image, video, or audio file, automatically detects the media type, sends the file through a Render-hosted Next.js API route to a tunneled local HPC GPU model server, receives real detector outputs, uses Anthropic Claude to reason over those outputs, sends an auditable event to Guild through a webhook, renders dynamic OpenUI-style report blocks, optionally runs Jua for weather/location claims, and lets the user take actions through Composio.

This is a web agent — not a simple upload app, not a fake/real detector, not a chatbot, and not a static dashboard.

## Architecture

```text
Browser
-> Render-hosted Next.js app
-> Next.js API route /api/analyze
-> Cloudflare Tunnel public URL
-> local HPC FastAPI GPU model server
-> real GPU-hosted image/audio/video models
-> back to Render Next.js API route
-> Anthropic Claude reasoning layer
-> Guild webhook event
-> optional Jua context check
-> response returned to browser
-> browser renders XTrace report immediately
```

Critical rules:

- The browser only ever calls internal `/api/*` routes.
- The browser never sees `MODEL_SERVER_URL`, the Cloudflare tunnel URL, `ANTHROPIC_API_KEY`, Guild webhook URL/signing secret, or any sponsor key.
- All vendor/sponsor calls happen server-side only.
- No mock reports, no fake scores, no random detector outputs, no fallback model scores.
- If a GPU model is unavailable, analysis fails or clearly shows unavailable (strict mode).
- Upload starts analysis immediately — no submit button.
- Reports live in React state and `sessionStorage` for the current session only. No Blob storage or database required.

## Sponsor tools

| Sponsor | Role |
|---|---|
| **Render** | Public web-agent deployment — hosts Next.js app and API routes. |
| **Cloudflare Tunnel** | Secure transport from Render backend to local HPC GPU server. |
| **HPC GPU Server** | Real model inference backend (image/audio/video classifiers). |
| **Anthropic Claude** | Evidence reasoning and structured report writer (never alters scores). |
| **Guild** | Webhook-based agent/session trace (`GUILD_WEBHOOK_URL` + `GUILD_WEBHOOK_SIGNING_SECRET`). |
| **Composio** | Action layer — GitHub issue, Slack summary, optional Notion save. |
| **OpenUI** | Dynamic report blocks from Claude output (whitelisted, safe render only). |
| **Jua** | Optional reality-context verification for weather/location/time claims. |

**Not used:** Pioneer, NVIDIA (in Next.js app), OpenAI, Blob storage, mock mode.

## Routes

Frontend: `/` · `/analyze` · `/report/current` · `/report/[jobId]` (legacy local dev)

Backend (server-side only):

- `POST /api/analyze` — upload → detect → GPU inference → Claude → Guild webhook → return complete report JSON.
- `GET /api/system-status` — secret-free deployment and sponsor status.
- `POST /api/actions/create-github-issue` · `POST /api/actions/send-slack` · `POST /api/actions/save-notion` — Composio actions from browser-supplied report payload.
- `POST /api/reality-context` — optional standalone Jua check (primary flow runs Jua inside analyze when relevant).

## Session report flow

1. User drops/selects a file on `/analyze`.
2. Analysis starts immediately (no submit button).
3. `/api/analyze` returns the complete report object.
4. Browser stores the report in React state and `sessionStorage`.
5. Report renders inline on `/analyze` or at `/report/current` from session storage.
6. Media preview uses `URL.createObjectURL` client-side; uploaded bytes are not persisted.
7. Server writes temporary files only during the request and deletes them after analysis.

## Deployment checklist

1. Start HPC FastAPI model server (`traceproof-model-server/`).
2. Verify `/health`, `/models`, `/model-inventory`.
3. Confirm required models are loaded (`REQUIRED_*_MODELS` env vars).
4. Start Cloudflare Tunnel (`scripts/run_tunnel_cloudflare.sh`).
5. Set `MODEL_SERVER_URL` on Render.
6. Set `ANTHROPIC_API_KEY` on Render.
7. Set `GUILD_WEBHOOK_URL` and `GUILD_WEBHOOK_SIGNING_SECRET` on Render.
8. Set Composio env vars on Render.
9. Optional: set Jua env vars.
10. Deploy Render service (`render.yaml` or manual Web Service).
11. Upload image/audio/video — confirm real GPU model signals.
12. Confirm no direct browser calls to tunnel or vendor URLs.

See `.env.example` for the full server-side variable list.

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm run lint
npm run build
```

HPC model server:

```bash
cd traceproof-model-server
python -m uvicorn server:app --host 0.0.0.0 --port 8001
bash scripts/run_tunnel_cloudflare.sh
```

Paste the tunnel URL into `MODEL_SERVER_URL` (server-side only).
