"""Run real HTTP tests against the local FastAPI model server.

No mocked responses: every result reflects an actual HTTP round trip to
http://localhost:8001. Models may legitimately report "unavailable" inside
the JSON body; that is a pass as long as the route itself returns 200 with
a schema-valid AnalysisResponse.

Output: outputs/local_api_test_results.json
"""

from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.utils.validation import validate_analysis_response  # noqa: E402

BASE_URL = "http://localhost:8001"
OUTPUT = ROOT / "outputs" / "local_api_test_results.json"

SAMPLES = {
    "image": (ROOT / "samples" / "images" / "test_image.png", "image/png"),
    "audio": (ROOT / "samples" / "audio" / "test_audio.wav", "audio/wav"),
    "video": (ROOT / "samples" / "videos" / "test_video.mp4", "video/mp4"),
}


def run_get(name: str, path: str, timeout: int = 30) -> dict[str, Any]:
    url = f"{BASE_URL}{path}"
    start = time.perf_counter()
    try:
        resp = requests.get(url, timeout=timeout)
        elapsed = round((time.perf_counter() - start) * 1000, 2)
        try:
            body = resp.json()
        except ValueError:
            body = None
        return {
            "name": name,
            "url": url,
            "status_code": resp.status_code,
            "passed": resp.status_code == 200 and body is not None,
            "response_time_ms": elapsed,
            "response_json": body,
            "error": None if resp.status_code == 200 else f"unexpected status {resp.status_code}",
        }
    except Exception as exc:
        elapsed = round((time.perf_counter() - start) * 1000, 2)
        return {
            "name": name,
            "url": url,
            "status_code": None,
            "passed": False,
            "response_time_ms": elapsed,
            "response_json": None,
            "error": str(exc),
        }


def run_post_upload(name: str, path: str, file_path: Path, content_type: str, timeout: int = 600) -> dict[str, Any]:
    url = f"{BASE_URL}{path}"
    if not file_path.exists():
        return {
            "name": name,
            "url": url,
            "status_code": None,
            "passed": False,
            "response_time_ms": 0,
            "response_json": None,
            "error": f"sample file missing: {file_path}",
        }

    start = time.perf_counter()
    try:
        with file_path.open("rb") as handle:
            files = {"file": (file_path.name, handle, content_type)}
            resp = requests.post(url, files=files, timeout=timeout)
        elapsed = round((time.perf_counter() - start) * 1000, 2)
        try:
            body = resp.json()
        except ValueError:
            body = None

        errors: list[str] = []
        if resp.status_code == 200:
            if body is None:
                errors.append("response was not valid JSON")
            else:
                errors.extend(validate_analysis_response(body))

        return {
            "name": name,
            "url": url,
            "status_code": resp.status_code,
            "passed": resp.status_code == 200 and not errors,
            "response_time_ms": elapsed,
            "response_json": body,
            "error": "; ".join(errors) if errors else (None if resp.status_code == 200 else f"unexpected status {resp.status_code}"),
        }
    except Exception as exc:
        elapsed = round((time.perf_counter() - start) * 1000, 2)
        return {
            "name": name,
            "url": url,
            "status_code": None,
            "passed": False,
            "response_time_ms": elapsed,
            "response_json": None,
            "error": str(exc),
        }


def main() -> None:
    results: list[dict[str, Any]] = []

    results.append(run_get("GET /health", "/health"))
    results.append(run_get("GET /gpu", "/gpu"))
    results.append(run_get("GET /models", "/models"))
    results.append(run_get("GET /model-inventory", "/model-inventory"))

    image_path, image_ct = SAMPLES["image"]
    audio_path, audio_ct = SAMPLES["audio"]
    video_path, video_ct = SAMPLES["video"]

    results.append(run_post_upload("POST /v1/analyze/image", "/v1/analyze/image", image_path, image_ct))
    results.append(run_post_upload("POST /v1/analyze/audio", "/v1/analyze/audio", audio_path, audio_ct))
    results.append(run_post_upload("POST /v1/analyze/video", "/v1/analyze/video", video_path, video_ct))

    results.append(run_post_upload("POST /v1/analyze/multimodal (image)", "/v1/analyze/multimodal", image_path, image_ct))
    results.append(run_post_upload("POST /v1/analyze/multimodal (audio)", "/v1/analyze/multimodal", audio_path, audio_ct))
    results.append(run_post_upload("POST /v1/analyze/multimodal (video)", "/v1/analyze/multimodal", video_path, video_ct))

    summary = {
        "total": len(results),
        "passed": sum(1 for r in results if r["passed"]),
        "failed": sum(1 for r in results if not r["passed"]),
    }

    report = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "base_url": BASE_URL,
        "results": results,
        "summary": summary,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(report, indent=2, default=str) + "\n", encoding="utf-8")

    for r in results:
        status = "PASS" if r["passed"] else "FAIL"
        print(f"{status}  {r['name']}  status={r['status_code']}  {r['response_time_ms']}ms  {r['error'] or ''}")
    print(f"\n{summary['passed']}/{summary['total']} passed. Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
