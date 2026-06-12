"""Run the same endpoint tests as test_local_endpoints.py against the
public Cloudflare tunnel URL.

The tunnel URL is read from outputs/tunnel_info.json (written by
scripts/run_tunnel_cloudflare.sh) and is never hardcoded. If that file is
missing or has no public_url, this script fails honestly, explains how to
recover, and still writes outputs/tunnel_api_test_results.json.

Output: outputs/tunnel_api_test_results.json
"""

from __future__ import annotations

import json
import re
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.utils.validation import validate_analysis_response  # noqa: E402

TUNNEL_INFO = ROOT / "outputs" / "tunnel_info.json"
OUTPUT = ROOT / "outputs" / "tunnel_api_test_results.json"

SAMPLES = {
    "image": (ROOT / "samples" / "images" / "test_image.png", "image/png"),
    "audio": (ROOT / "samples" / "audio" / "test_audio.wav", "audio/wav"),
    "video": (ROOT / "samples" / "videos" / "test_video.mp4", "video/mp4"),
}

RECOVERY_HINT = (
    "Run scripts/run_tunnel_cloudflare.sh, then re-run this script. "
    "If the URL still cannot be detected automatically, open "
    "outputs/cloudflared_tunnel.log and copy the https://*.trycloudflare.com "
    "URL into outputs/tunnel_info.json's 'public_url' field manually."
)


def _public_resolve(host: str) -> str | None:
    """Resolve a hostname using public resolvers, bypassing the local stub.

    Fresh Cloudflare quick-tunnel subdomains (*.trycloudflare.com) are valid
    and globally resolvable, but some hosts' local resolver (e.g. a
    systemd-resolved stub with a stale negative cache, or a corporate DNS
    that won't recurse for them) returns NXDOMAIN. The public internet -
    including the web-hosted Next.js app - resolves them fine. We mirror that
    reality so the test reports the tunnel's true public reachability.
    """
    for resolver in ("8.8.8.8", "1.1.1.1", "9.9.9.9"):
        try:
            out = subprocess.run(
                ["nslookup", host, resolver], capture_output=True, text=True, timeout=10
            ).stdout
        except Exception:
            continue
        # The first "Address:" line is the resolver itself; skip it.
        addresses = re.findall(r"Address:\s*([0-9.]+)", out)
        for addr in addresses:
            if addr != resolver:
                return addr
    return None


def ensure_resolvable(host: str) -> dict[str, Any]:
    """Make `host` resolvable for this process.

    Returns a note dict describing how resolution was achieved. If the local
    resolver already works, nothing is changed. Otherwise we pin the host to
    a public-resolver answer by patching socket.getaddrinfo (SNI and Host
    header still use the real hostname, exactly like `curl --resolve`).
    """
    try:
        socket.getaddrinfo(host, 443)
        return {"method": "local resolver", "pinned_ip": None}
    except socket.gaierror:
        pass

    ip = _public_resolve(host)
    if ip is None:
        return {"method": "unresolvable (local + public resolvers failed)", "pinned_ip": None}

    real_getaddrinfo = socket.getaddrinfo

    def patched(node, *args, **kwargs):  # type: ignore[no-untyped-def]
        if node == host:
            return real_getaddrinfo(ip, *args, **kwargs)
        return real_getaddrinfo(node, *args, **kwargs)

    socket.getaddrinfo = patched  # type: ignore[assignment]
    return {"method": f"pinned to {ip} via public resolver (local DNS could not resolve)", "pinned_ip": ip}


def load_tunnel_url() -> tuple[str | None, str | None]:
    if not TUNNEL_INFO.exists():
        return None, f"{TUNNEL_INFO.relative_to(ROOT)} not found. {RECOVERY_HINT}"
    try:
        data = json.loads(TUNNEL_INFO.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return None, f"{TUNNEL_INFO.relative_to(ROOT)} is not valid JSON ({exc}). {RECOVERY_HINT}"

    url = data.get("public_url")
    if not url:
        return None, f"{TUNNEL_INFO.relative_to(ROOT)} has no public_url (status={data.get('status')}). {RECOVERY_HINT}"
    return url, None


def run_get(base_url: str, name: str, path: str, timeout: int = 30) -> dict[str, Any]:
    url = f"{base_url}{path}"
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


def run_post_upload(base_url: str, name: str, path: str, file_path: Path, content_type: str, timeout: int = 600) -> dict[str, Any]:
    url = f"{base_url}{path}"
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


def write_report(base_url: str | None, results: list[dict[str, Any]], skipped_reason: str | None, dns_note: str | None = None) -> dict[str, Any]:
    summary = {
        "total": len(results),
        "passed": sum(1 for r in results if r["passed"]),
        "failed": sum(1 for r in results if not r["passed"]),
    }
    report = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "base_url": base_url,
        "dns_resolution": dns_note,
        "skipped_reason": skipped_reason,
        "results": results,
        "summary": summary,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(report, indent=2, default=str) + "\n", encoding="utf-8")
    return report


def main() -> None:
    base_url, error = load_tunnel_url()
    if base_url is None:
        print(f"SKIP tunnel endpoint tests: {error}")
        write_report(None, [], error)
        return

    print(f"Testing tunnel URL: {base_url}")
    host = urlparse(base_url).hostname or ""
    dns = ensure_resolvable(host)
    print(f"DNS resolution: {dns['method']}")
    results: list[dict[str, Any]] = []

    results.append(run_get(base_url, "GET /health", "/health"))
    results.append(run_get(base_url, "GET /gpu", "/gpu"))
    results.append(run_get(base_url, "GET /models", "/models"))
    results.append(run_get(base_url, "GET /model-inventory", "/model-inventory"))

    image_path, image_ct = SAMPLES["image"]
    audio_path, audio_ct = SAMPLES["audio"]
    video_path, video_ct = SAMPLES["video"]

    results.append(run_post_upload(base_url, "POST /v1/analyze/image", "/v1/analyze/image", image_path, image_ct))
    results.append(run_post_upload(base_url, "POST /v1/analyze/audio", "/v1/analyze/audio", audio_path, audio_ct))
    results.append(run_post_upload(base_url, "POST /v1/analyze/video", "/v1/analyze/video", video_path, video_ct))

    results.append(run_post_upload(base_url, "POST /v1/analyze/multimodal (image)", "/v1/analyze/multimodal", image_path, image_ct))
    results.append(run_post_upload(base_url, "POST /v1/analyze/multimodal (audio)", "/v1/analyze/multimodal", audio_path, audio_ct))
    results.append(run_post_upload(base_url, "POST /v1/analyze/multimodal (video)", "/v1/analyze/multimodal", video_path, video_ct))

    report = write_report(base_url, results, None, dns_note=dns["method"])

    for r in results:
        status = "PASS" if r["passed"] else "FAIL"
        print(f"{status}  {r['name']}  status={r['status_code']}  {r['response_time_ms']}ms  {r['error'] or ''}")
    print(f"\n{report['summary']['passed']}/{report['summary']['total']} passed. Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
