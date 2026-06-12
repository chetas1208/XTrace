# XTrace Model Server

Private FastAPI GPU inference engine for XTrace.

This service is the inference engine only. The browser must not call it directly.

Architecture:

```text
Browser / Frontend
-> Next.js API routes
-> MODEL_SERVER_URL tunnel or localhost URL
-> FastAPI model server on the GPU box
-> GPU-hosted open-source models
```

The Next.js app owns upload UX, job storage, report rendering, and server-side proxying. This FastAPI app owns model inference. No auth is enabled by design; do not upload private or sensitive media if you expose this service publicly.

## Hardware Plan

Target machine: 2x NVIDIA RTX 3090, 24 GB VRAM each.

GPU 0:

- UniversalFakeDetect
- capcheck image detector
- OpenCLIP
- DIRE only when `ENABLE_DIRE=true`
- NVIDIA VLM only when `ENABLE_VLM=true` and memory allows

GPU 1:

- AASIST
- Wav2Vec2 audio detector
- NVIDIA Parakeet ASR
- GenConViT
- Temporal video analyzer orchestration

CPU:

- MesoNet via TensorFlow/Keras with TensorFlow GPU visibility disabled

Models lazy-load on first request. Set `LOAD_ALL_MODELS=true` only when you want startup to attempt loading every enabled model.

## Setup

```bash
cd traceproof-model-server

python -m venv .venv
source .venv/bin/activate

pip install --upgrade pip
pip install -r requirements.txt

bash scripts/download_repos.sh
python scripts/download_models.py

bash scripts/run_server.sh
```

In another terminal:

```bash
bash scripts/run_tunnel_cloudflare.sh
```

or:

```bash
bash scripts/run_tunnel_ngrok.sh
```

Then set the main Next.js app env:

```bash
MODEL_SERVER_URL=https://your-tunnel-url
```

Do not use a public browser env var for the model server URL.

## System Dependencies

- Python 3.10 or 3.11 preferred
- CUDA-compatible PyTorch
- `ffmpeg`
- `ffprobe`
- `git-lfs` recommended
- `cloudflared` optional
- `ngrok` optional

GenConViT currently requires the upstream-compatible `timm==0.6.5`; OpenCLIP is pinned to a compatible `open_clip_torch` release in `requirements.txt`.

Python 3.13 may work for parts of the service, but some model packages may not publish wheels for it. Use Python 3.10 or 3.11 for the most reliable CUDA/NeMo setup.

## Environment

Copy `.env.example` to `.env` and adjust as needed.

Important defaults:

- `ENABLE_DIRE=false`
- `ENABLE_RAWNET2=false`
- `ENABLE_DEEPFAKEBENCH=false`
- `ENABLE_VLM=false`
- `MODEL_PRECISION=fp16`
- `CUDA_IMAGE_DEVICE=cuda:0`
- `CUDA_AUDIO_VIDEO_DEVICE=cuda:1`

## Endpoints

Base URL:

```text
http://localhost:8001
```

Endpoints:

- `GET /health`
- `GET /models`
- `GET /gpu`
- `GET /model-inventory`
- `POST /v1/analyze/image`
- `POST /v1/analyze/audio`
- `POST /v1/analyze/video`
- `POST /v1/analyze/multimodal`
Every analysis endpoint accepts multipart upload field `file`.

## Truthful Failure Behavior

If a model is not downloaded, cannot load, lacks a checkpoint, or has an incomplete adapter, the response contains a `ModelSignal` with:

- `status: "unavailable"` or `status: "failed"`
- `score: null`
- `confidence: null`
- a clear limitation message

The server never replaces missing model output with guessed values.

## Model Downloads

Automatic where practical:

- OpenCLIP weights are fetched by `open_clip_torch` on first load.
- capcheck image detector: `capcheck/ai-human-generated-image-detection`
- Wav2Vec2 audio detector: `garystafford/wav2vec2-deepfake-voice-detector`
- NVIDIA Parakeet: `nvidia/parakeet-tdt-0.6b-v2`
- GenConViT files: `Deressa/GenConViT`
- NVIDIA Cosmos Reason: `nvidia/Cosmos-Reason1-7B` only when VLM is enabled

Bundled in cloned repositories:

- UniversalFakeDetect
- AASIST
- MesoNet

Optional later/manual:

- DIRE
- RawNet2
- DeepfakeBench
- NVIDIA Cosmos/VILA explanation model

Place manual checkpoints under `model_weights/` as documented in `model_weights/README.md`.

## Validation

```bash
python -m compileall app server.py config.py scripts
bash scripts/run_server.sh
python scripts/smoke_test.py
```

The smoke test checks schemas and no-crash behavior. It does not assert fake expected scores.

XTrace does not produce absolute fake/real truth. It produces model-backed provenance risk signals.

## End-to-End System Check

`scripts/full_system_check.py` runs the full verification pipeline and writes every artifact to `outputs/`:

```bash
cd traceproof-model-server
python scripts/full_system_check.py
```

In order, it:

1. Verifies the Python environment, key package versions, and `pip check`
2. Verifies system dependencies (`ffmpeg`, `ffprobe`, `git`, `curl`, `cloudflared`, ...), installing `cloudflared` via `scripts/install_cloudflared.sh` if missing
3. Generates synthetic plumbing media under `samples/` (`scripts/generate_sample_media.py`)
4. Checks GPU status via torch + `nvidia-smi` -> `outputs/gpu.json`
5. Checks model checkpoint/asset inventory -> `outputs/model_inventory.json`
6. Loads every enabled model in a fresh process and records real success/failure/unavailable status -> `outputs/model_load_test.json`
7. Starts the FastAPI server if it isn't already running, and writes `outputs/health.json`
8. Runs real HTTP tests against every local endpoint -> `outputs/local_api_test_results.json`
9. Starts a Cloudflare quick tunnel if one isn't already running -> `outputs/tunnel_info.json`
10. Runs the same HTTP tests against the public tunnel URL -> `outputs/tunnel_api_test_results.json`
11. Scans `app/`, `server.py`, `config.py` for random-number-based "mock" scores
12. Writes `outputs/full_system_report.md` summarizing everything above

Every step is also runnable on its own:

```bash
python scripts/generate_sample_media.py
python scripts/test_model_loads.py
python scripts/test_local_endpoints.py
bash scripts/run_tunnel_cloudflare.sh
python scripts/test_tunnel_endpoints.py
```

None of these scripts invent scores or "pass" results. A model that is missing a checkpoint, fails to import, or runs out of GPU memory is reported as `unavailable`/`failed` with the real error message.

## Manual curl Examples

Local server (run on the GPU box):

```bash
curl -s http://localhost:8001/health | python3 -m json.tool

curl -s -X POST http://localhost:8001/v1/analyze/image \
  -F "file=@samples/images/test_image.png" | python3 -m json.tool

curl -s -X POST http://localhost:8001/v1/analyze/audio \
  -F "file=@samples/audio/test_audio.wav" | python3 -m json.tool

curl -s -X POST http://localhost:8001/v1/analyze/video \
  -F "file=@samples/videos/test_video.mp4" | python3 -m json.tool
```

Through the Cloudflare tunnel (use the `public_url` from `outputs/tunnel_info.json`):

```bash
curl -s https://YOUR-TUNNEL.trycloudflare.com/health | python3 -m json.tool

curl -s -X POST https://YOUR-TUNNEL.trycloudflare.com/v1/analyze/image \
  -F "file=@samples/images/test_image.png" | python3 -m json.tool
```

## MODEL_SERVER_URL (Next.js integration)

The Next.js frontend must never call this server directly from the browser. In the Next.js app, set this **server-side only** (e.g. in `.env`, never `.env.local` exposed to the client, and **never** as `NEXT_PUBLIC_MODEL_SERVER_URL`):

```bash
MODEL_SERVER_URL=https://YOUR-TUNNEL.trycloudflare.com
```

Get the current value from `outputs/tunnel_info.json` (`public_url`) after running `scripts/run_tunnel_cloudflare.sh` or `scripts/full_system_check.py`. Next.js API routes proxy requests to `MODEL_SERVER_URL`; the browser only ever talks to the Next.js app, never to this model server.
