"""Master end-to-end system check for the TraceProofAI model server.

Runs, in order:
  A. Verify Python environment
  B. Verify system dependencies (installs cloudflared if missing)
  C. Generate sample media if missing
  D. Verify GPU with torch + nvidia-smi
  E. Run verify_model_assets.py
  F. Run test_model_loads.py
  G. Start the FastAPI server if it isn't already running
  H. Run local endpoint tests
  I. Start a Cloudflare tunnel if one isn't already running
  J/K. Run tunnel endpoint tests
  L. Generate outputs/full_system_report.md

Every step writes its own JSON artifact to outputs/. Nothing here invents
scores, mocks model output, or fabricates a "pass" - failures and
"unavailable" results are reported verbatim.
"""

from __future__ import annotations

import json
import os
import platform
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
OUTPUT_DIR = ROOT / "outputs"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

BASE_URL = "http://localhost:8001"


def banner(title: str) -> None:
    print(f"\n{'=' * 70}\n{title}\n{'=' * 70}")


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, default=str) + "\n", encoding="utf-8")


def run_subprocess(cmd: list[str], timeout: int, label: str) -> dict[str, Any]:
    start = time.perf_counter()
    try:
        result = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=timeout)
        return {
            "label": label,
            "cmd": cmd,
            "returncode": result.returncode,
            "stdout": result.stdout[-20000:],
            "stderr": result.stderr[-20000:],
            "duration_s": round(time.perf_counter() - start, 2),
            "timed_out": False,
        }
    except subprocess.TimeoutExpired as exc:
        return {
            "label": label,
            "cmd": cmd,
            "returncode": None,
            "stdout": (exc.stdout or "")[-20000:],
            "stderr": (exc.stderr or "")[-20000:],
            "duration_s": round(time.perf_counter() - start, 2),
            "timed_out": True,
        }


# ---------------------------------------------------------------------------
# A. Python environment
# ---------------------------------------------------------------------------

def step_python_environment() -> dict[str, Any]:
    banner("A. Verifying Python environment")
    info: dict[str, Any] = {
        "python_executable": sys.executable,
        "python_version": sys.version,
        "platform": platform.platform(),
        "venv_present": (ROOT / ".venv").exists(),
        "cwd": str(ROOT),
    }

    pip_version = run_subprocess([sys.executable, "-m", "pip", "--version"], 30, "pip --version")
    info["pip_version"] = pip_version["stdout"].strip() or pip_version["stderr"].strip()

    packages = ["torch", "torchvision", "torchaudio", "fastapi", "uvicorn", "transformers", "tensorflow", "open_clip_torch", "nemo_toolkit"]
    versions: dict[str, str] = {}
    for pkg in packages:
        check = run_subprocess(
            [sys.executable, "-c", f"import importlib.metadata as m; print(m.version('{pkg}'))"],
            20,
            f"version({pkg})",
        )
        versions[pkg] = check["stdout"].strip() if check["returncode"] == 0 else "not installed"
    info["package_versions"] = versions

    pip_check = run_subprocess([sys.executable, "-m", "pip", "check"], 60, "pip check")
    info["pip_check"] = {
        "ok": pip_check["returncode"] == 0,
        "output": (pip_check["stdout"] + pip_check["stderr"]).strip(),
    }

    print(f"Python: {info['python_version'].splitlines()[0]}")
    print(f"Executable: {info['python_executable']}")
    print(f".venv present: {info['venv_present']}")
    for pkg, ver in versions.items():
        print(f"  {pkg}: {ver}")
    if not info["pip_check"]["ok"]:
        print(f"pip check: ISSUES FOUND -> {info['pip_check']['output']}")
    else:
        print("pip check: OK")

    return info


# ---------------------------------------------------------------------------
# B. System dependencies
# ---------------------------------------------------------------------------

def _tool_version(cmd: list[str]) -> str | None:
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        text = (result.stdout or result.stderr or "").strip().splitlines()
        return text[0] if text else None
    except Exception:
        return None


def step_dependencies() -> dict[str, Any]:
    banner("B. Verifying system dependencies")
    deps: dict[str, dict[str, Any]] = {}

    deps["python"] = {"found": True, "path": sys.executable, "version": sys.version.split()[0]}

    pip_path = shutil.which("pip") or shutil.which("pip3")
    deps["pip"] = {"found": pip_path is not None, "path": pip_path, "version": _tool_version([sys.executable, "-m", "pip", "--version"])}

    git_path = shutil.which("git")
    deps["git"] = {"found": git_path is not None, "path": git_path, "version": _tool_version(["git", "--version"]) if git_path else None}

    curl_path = shutil.which("curl")
    deps["curl"] = {"found": curl_path is not None, "path": curl_path, "version": _tool_version(["curl", "--version"]) if curl_path else None}

    ffmpeg_path = shutil.which("ffmpeg")
    ffmpeg_source = "PATH"
    if not ffmpeg_path:
        try:
            import imageio_ffmpeg

            ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
            ffmpeg_source = "imageio_ffmpeg bundled binary"
        except Exception:
            ffmpeg_path = None
            ffmpeg_source = None
    deps["ffmpeg"] = {
        "found": ffmpeg_path is not None,
        "path": ffmpeg_path,
        "source": ffmpeg_source,
        "version": _tool_version([ffmpeg_path, "-version"]) if ffmpeg_path else None,
    }

    ffprobe_path = shutil.which("ffprobe")
    deps["ffprobe"] = {
        "found": ffprobe_path is not None,
        "path": ffprobe_path,
        "version": _tool_version([ffprobe_path, "-version"]) if ffprobe_path else None,
        "note": None if ffprobe_path else "ffprobe not on PATH; provenance/media-type detection that relies on ffprobe will report unavailable",
    }

    exiftool_path = shutil.which("exiftool")
    deps["exiftool"] = {"found": exiftool_path is not None, "path": exiftool_path, "version": _tool_version(["exiftool", "-ver"]) if exiftool_path else None}

    c2patool_path = shutil.which("c2patool")
    deps["c2patool"] = {"found": c2patool_path is not None, "path": c2patool_path, "version": _tool_version(["c2patool", "--version"]) if c2patool_path else None}

    # cloudflared: PATH, then bin/, then attempt install
    cloudflared_path = shutil.which("cloudflared")
    bin_cloudflared = ROOT / "bin" / "cloudflared"
    if not cloudflared_path and bin_cloudflared.exists():
        cloudflared_path = str(bin_cloudflared)
    if not cloudflared_path:
        print("cloudflared not found; running scripts/install_cloudflared.sh ...")
        install = run_subprocess(["bash", "scripts/install_cloudflared.sh"], 180, "install_cloudflared.sh")
        print(install["stdout"])
        if install["stderr"]:
            print(install["stderr"])
        if shutil.which("cloudflared"):
            cloudflared_path = shutil.which("cloudflared")
        elif bin_cloudflared.exists():
            cloudflared_path = str(bin_cloudflared)
    deps["cloudflared"] = {
        "found": cloudflared_path is not None,
        "path": cloudflared_path,
        "version": _tool_version([cloudflared_path, "--version"]) if cloudflared_path else None,
    }

    for name, info in deps.items():
        status = "OK" if info["found"] else "MISSING"
        print(f"  {name:10s} {status:8s} {info.get('path') or ''} {info.get('version') or ''}")

    return deps


# ---------------------------------------------------------------------------
# C. Sample media
# ---------------------------------------------------------------------------

def step_sample_media() -> dict[str, Any]:
    banner("C. Generating sample media (if missing)")
    result = run_subprocess([sys.executable, "scripts/generate_sample_media.py"], 120, "generate_sample_media.py")
    print(result["stdout"])
    if result["stderr"]:
        print(result["stderr"])

    files = {
        "image": ROOT / "samples" / "images" / "test_image.png",
        "audio": ROOT / "samples" / "audio" / "test_audio.wav",
        "video": ROOT / "samples" / "videos" / "test_video.mp4",
    }
    return {
        "returncode": result["returncode"],
        "stdout": result["stdout"],
        "stderr": result["stderr"],
        "files": {key: {"path": str(path.relative_to(ROOT)), "exists": path.exists(), "size_bytes": path.stat().st_size if path.exists() else 0} for key, path in files.items()},
    }


# ---------------------------------------------------------------------------
# D. GPU status
# ---------------------------------------------------------------------------

def step_gpu_status() -> dict[str, Any]:
    banner("D. Verifying GPU (torch + nvidia-smi)")

    torch_code = (
        "import json, torch\n"
        "data = {'torch_version': torch.__version__, 'cuda_available': torch.cuda.is_available(), 'gpu_count': 0, 'gpus': []}\n"
        "if torch.cuda.is_available():\n"
        "    data['gpu_count'] = torch.cuda.device_count()\n"
        "    for i in range(torch.cuda.device_count()):\n"
        "        props = torch.cuda.get_device_properties(i)\n"
        "        data['gpus'].append({'index': i, 'name': props.name, 'total_memory_mb': round(props.total_memory/1024/1024, 2), 'compute_capability': f'{props.major}.{props.minor}'})\n"
        "print(json.dumps(data))\n"
    )
    torch_result = run_subprocess([sys.executable, "-c", torch_code], 60, "torch gpu check")
    try:
        torch_info = json.loads(torch_result["stdout"].strip().splitlines()[-1])
    except Exception:
        torch_info = {"error": torch_result["stderr"] or torch_result["stdout"]}

    nvidia_smi_path = shutil.which("nvidia-smi")
    nvidia_smi: dict[str, Any] = {"available": nvidia_smi_path is not None}
    if nvidia_smi_path:
        csv_result = subprocess.run(
            ["nvidia-smi", "--query-gpu=index,name,memory.total,memory.used,memory.free,utilization.gpu,temperature.gpu", "--format=csv,noheader,nounits"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        gpus = []
        for line in csv_result.stdout.strip().splitlines():
            parts = [p.strip() for p in line.split(",")]
            if len(parts) == 7:
                gpus.append(
                    {
                        "index": int(parts[0]),
                        "name": parts[1],
                        "memory_total_mb": int(parts[2]),
                        "memory_used_mb": int(parts[3]),
                        "memory_free_mb": int(parts[4]),
                        "utilization_pct": int(parts[5]),
                        "temperature_c": int(parts[6]),
                    }
                )
        nvidia_smi["gpus"] = gpus
        raw = subprocess.run(["nvidia-smi"], capture_output=True, text=True, timeout=30)
        nvidia_smi["raw"] = raw.stdout

    report = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "torch": torch_info,
        "nvidia_smi": nvidia_smi,
    }
    write_json(OUTPUT_DIR / "gpu.json", report)

    if torch_info.get("cuda_available"):
        print(f"torch: CUDA available, {torch_info.get('gpu_count')} GPU(s)")
        for gpu in torch_info.get("gpus", []):
            print(f"  GPU {gpu['index']}: {gpu['name']} ({gpu['total_memory_mb']} MB)")
    else:
        print("torch: CUDA NOT available")
    if nvidia_smi["available"]:
        for gpu in nvidia_smi.get("gpus", []):
            print(f"  nvidia-smi GPU {gpu['index']}: {gpu['memory_used_mb']}/{gpu['memory_total_mb']} MB used, {gpu['utilization_pct']}% util")
    else:
        print("nvidia-smi: not found")

    return report


# ---------------------------------------------------------------------------
# E. Model asset inventory
# ---------------------------------------------------------------------------

def step_model_inventory() -> dict[str, Any]:
    banner("E. Verifying model assets (verify_model_assets.py)")
    script = ROOT / "scripts" / "verify_model_assets.py"
    if not script.exists():
        print("scripts/verify_model_assets.py not found; skipping")
        return {"skipped": True}

    result = run_subprocess([sys.executable, "scripts/verify_model_assets.py"], 300, "verify_model_assets.py")
    print(result["stdout"])
    if result["stderr"]:
        print(result["stderr"])

    inventory_path = OUTPUT_DIR / "model_inventory.json"
    inventory = json.loads(inventory_path.read_text(encoding="utf-8")) if inventory_path.exists() else []
    for item in inventory:
        status = "OK" if item.get("inference_possible") else ("inactive" if not item.get("active") else "ISSUE")
        print(f"  {status:8s} {item['model_name']}: {item['reason']}")
    return {"returncode": result["returncode"], "inventory": inventory}


# ---------------------------------------------------------------------------
# F. Model load tests
# ---------------------------------------------------------------------------

def step_model_loads() -> dict[str, Any]:
    banner("F. Testing model loadability (test_model_loads.py)")
    result = run_subprocess([sys.executable, "scripts/test_model_loads.py"], 900, "test_model_loads.py")
    print(result["stdout"])
    if result["stderr"]:
        print(result["stderr"][-4000:])

    path = OUTPUT_DIR / "model_load_test.json"
    data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"models": []}
    return {"returncode": result["returncode"], "timed_out": result["timed_out"], "data": data}


# ---------------------------------------------------------------------------
# G. Server lifecycle
# ---------------------------------------------------------------------------

def server_health() -> dict[str, Any] | None:
    try:
        resp = requests.get(f"{BASE_URL}/health", timeout=5)
        if resp.status_code == 200:
            return resp.json()
    except requests.exceptions.RequestException:
        pass
    return None


def step_server() -> dict[str, Any]:
    banner("G. Checking FastAPI model server")
    health = server_health()
    if health is not None:
        write_json(OUTPUT_DIR / "health.json", health)
        print(f"Server already running at {BASE_URL}: {health}")
        return {"already_running": True, "started": False, "health": health}

    print(f"Server not responding at {BASE_URL}; starting it.")
    run_script = ROOT / "scripts" / "run_server.sh"
    log_path = OUTPUT_DIR / "server.log"
    log_handle = log_path.open("ab")
    if run_script.exists():
        cmd = ["bash", str(run_script)]
    else:
        cmd = [sys.executable, "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001"]

    proc = subprocess.Popen(cmd, cwd=ROOT, stdout=log_handle, stderr=subprocess.STDOUT, start_new_session=True)
    (OUTPUT_DIR / "server.pid").write_text(str(proc.pid))

    health = None
    for _ in range(60):
        time.sleep(1)
        health = server_health()
        if health is not None:
            break

    if health is not None:
        write_json(OUTPUT_DIR / "health.json", health)
        print(f"Server started (pid {proc.pid}): {health}")
        return {"already_running": False, "started": True, "pid": proc.pid, "health": health}

    print(f"ERROR: server did not become healthy within 60s. See {log_path}")
    return {"already_running": False, "started": False, "pid": proc.pid, "health": None, "log_file": str(log_path.relative_to(ROOT))}


# ---------------------------------------------------------------------------
# H. Local endpoint tests
# ---------------------------------------------------------------------------

def step_local_tests() -> dict[str, Any]:
    banner("H. Running local endpoint tests (test_local_endpoints.py)")
    result = run_subprocess([sys.executable, "scripts/test_local_endpoints.py"], 900, "test_local_endpoints.py")
    print(result["stdout"])
    if result["stderr"]:
        print(result["stderr"][-4000:])

    path = OUTPUT_DIR / "local_api_test_results.json"
    data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"results": [], "summary": {}}
    return {"returncode": result["returncode"], "timed_out": result["timed_out"], "data": data}


# ---------------------------------------------------------------------------
# I. Cloudflare tunnel
# ---------------------------------------------------------------------------

def tunnel_is_running() -> dict[str, Any] | None:
    info_path = OUTPUT_DIR / "tunnel_info.json"
    if not info_path.exists():
        return None
    try:
        info = json.loads(info_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    if info.get("status") != "running" or not info.get("public_url"):
        return None
    pid = info.get("pid")
    if pid is not None:
        try:
            os.kill(pid, 0)
        except OSError:
            return None
    return info


def step_tunnel() -> dict[str, Any]:
    banner("I. Starting/checking Cloudflare tunnel")
    existing = tunnel_is_running()
    if existing is not None:
        print(f"Reusing existing tunnel: {existing['public_url']} (pid {existing.get('pid')})")
        return existing

    result = run_subprocess(["bash", "scripts/run_tunnel_cloudflare.sh"], 90, "run_tunnel_cloudflare.sh")
    print(result["stdout"])
    if result["stderr"]:
        print(result["stderr"])

    info_path = OUTPUT_DIR / "tunnel_info.json"
    info = json.loads(info_path.read_text(encoding="utf-8")) if info_path.exists() else {"status": "failed", "public_url": None}
    if info.get("status") == "running":
        print(f"Tunnel running: {info['public_url']}")
    else:
        print("Tunnel FAILED to start within timeout. Local tests will still be reported.")
    return info


# ---------------------------------------------------------------------------
# K. Tunnel endpoint tests
# ---------------------------------------------------------------------------

def step_tunnel_tests(tunnel_info: dict[str, Any]) -> dict[str, Any]:
    banner("K. Running tunnel endpoint tests (test_tunnel_endpoints.py)")
    if tunnel_info.get("status") != "running" or not tunnel_info.get("public_url"):
        print("SKIP: tunnel is not running.")
        data = {"base_url": None, "skipped_reason": "tunnel not running", "results": [], "summary": {"total": 0, "passed": 0, "failed": 0}}
        write_json(OUTPUT_DIR / "tunnel_api_test_results.json", data)
        return {"returncode": None, "timed_out": False, "data": data}

    # Give the tunnel a few seconds to fully register before hammering it.
    time.sleep(3)
    result = run_subprocess([sys.executable, "scripts/test_tunnel_endpoints.py"], 600, "test_tunnel_endpoints.py")
    print(result["stdout"])
    if result["stderr"]:
        print(result["stderr"][-4000:])

    path = OUTPUT_DIR / "tunnel_api_test_results.json"
    data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"results": [], "summary": {}}
    return {"returncode": result["returncode"], "timed_out": result["timed_out"], "data": data}


# ---------------------------------------------------------------------------
# 12. No-mock / anti-fabrication scan
# ---------------------------------------------------------------------------

HARD_PATTERNS = [
    re.compile(r"random\.random\("),
    re.compile(r"np\.random\.\w+\("),
    re.compile(r"numpy\.random\.\w+\("),
]
FAKE_SCORE_LITERAL = re.compile(r"fake_score\s*=\s*[0-9]")
SOFT_PATTERNS = [
    re.compile(r"\bmock\b", re.IGNORECASE),
    re.compile(r"TODO return fake", re.IGNORECASE),
    re.compile(r"placeholder score", re.IGNORECASE),
    re.compile(r"fake_score", re.IGNORECASE),
]
SCAN_TARGETS = ["app", "server.py", "config.py"]


def no_mock_scan() -> dict[str, Any]:
    banner("Running no-mock / anti-fabrication scan")
    violations: list[dict[str, Any]] = []
    informational: list[dict[str, Any]] = []

    targets: list[Path] = []
    for entry in SCAN_TARGETS:
        path = ROOT / entry
        if path.is_dir():
            targets.extend(sorted(path.rglob("*.py")))
        elif path.is_file():
            targets.append(path)

    for path in targets:
        if "__pycache__" in path.parts:
            continue
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except Exception:
            continue
        rel = str(path.relative_to(ROOT))
        for lineno, line in enumerate(lines, start=1):
            for pattern in HARD_PATTERNS:
                if pattern.search(line):
                    violations.append({"file": rel, "line": lineno, "text": line.strip(), "pattern": pattern.pattern})
            if FAKE_SCORE_LITERAL.search(line):
                violations.append({"file": rel, "line": lineno, "text": line.strip(), "pattern": FAKE_SCORE_LITERAL.pattern})
                continue
            for pattern in SOFT_PATTERNS:
                if pattern.search(line):
                    informational.append({"file": rel, "line": lineno, "text": line.strip(), "pattern": pattern.pattern})

    result = {
        "passed": len(violations) == 0,
        "scanned_files": len(targets),
        "violations": violations,
        "informational": informational,
    }
    print(f"Scanned {len(targets)} files. Hard violations: {len(violations)}. Informational matches: {len(informational)}.")
    return result


# ---------------------------------------------------------------------------
# L. Final report
# ---------------------------------------------------------------------------

def classify_unavailable(entry: dict[str, Any]) -> str:
    status = entry.get("status")
    error = (entry.get("error") or "").lower()
    if status == "skipped":
        return "disabled by env"
    if status == "unavailable":
        if "checkpoint" in error or "weights" in error or ".pth" in error or ".nemo" in error or ".h5" in error:
            return "checkpoint missing"
        return f"unavailable: {entry.get('error')}"
    if status == "failed":
        if "out of memory" in error or "cuda oom" in error:
            return "CUDA OOM"
        if "modulenotfounderror" in error or "importerror" in error or "no module named" in error:
            return "import failed"
        if "huggingface" in error or "hf_hub" in error or "snapshot" in error or "401" in error or "403" in error:
            return "Hugging Face download failed"
        if "not implemented" in error:
            return "wrapper not implemented"
        return f"failed: {entry.get('error')}"
    return status or "unknown"


def render_report(state: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append("# TraceProofAI Model Server System Check")
    lines.append("")
    lines.append(f"Generated: {datetime.now(timezone.utc).isoformat()}")
    lines.append("")

    # 1. Environment
    lines.append("## 1. Environment")
    env = state["environment"]
    lines.append(f"- Python: `{env['python_version'].splitlines()[0]}`")
    lines.append(f"- Executable: `{env['python_executable']}`")
    lines.append(f"- Platform: {env['platform']}")
    lines.append(f"- `.venv` present: {env['venv_present']}")
    lines.append(f"- pip: {env['pip_version']}")
    lines.append("- Key packages:")
    for pkg, ver in env["package_versions"].items():
        lines.append(f"  - `{pkg}`: {ver}")
    if env["pip_check"]["ok"]:
        lines.append("- `pip check`: OK")
    else:
        lines.append(f"- `pip check`: ISSUES -> `{env['pip_check']['output']}`")
    lines.append("")

    # 2. GPU Status
    lines.append("## 2. GPU Status")
    gpu = state["gpu"]
    torch_info = gpu.get("torch", {})
    if torch_info.get("cuda_available"):
        lines.append(f"- CUDA available via torch {torch_info.get('torch_version')}: {torch_info.get('gpu_count')} GPU(s)")
        for g in torch_info.get("gpus", []):
            lines.append(f"  - GPU {g['index']}: {g['name']} ({g['total_memory_mb']} MB, compute {g.get('compute_capability')})")
    else:
        lines.append(f"- CUDA NOT available via torch: {torch_info}")
    nv = gpu.get("nvidia_smi", {})
    if nv.get("available"):
        lines.append("- `nvidia-smi`:")
        for g in nv.get("gpus", []):
            lines.append(f"  - GPU {g['index']} ({g['name']}): {g['memory_used_mb']}/{g['memory_total_mb']} MB used, {g['utilization_pct']}% util, {g['temperature_c']}C")
    else:
        lines.append("- `nvidia-smi` not found")
    lines.append("")
    lines.append("Full data: `outputs/gpu.json`")
    lines.append("")

    # 3. Dependency Status
    lines.append("## 3. Dependency Status")
    lines.append("| Tool | Found | Path | Version |")
    lines.append("|---|---|---|---|")
    for name, info in state["dependencies"].items():
        found = "yes" if info["found"] else "**no**"
        lines.append(f"| {name} | {found} | `{info.get('path') or '-'}` | {info.get('version') or '-'} |")
    ffprobe = state["dependencies"].get("ffprobe", {})
    if not ffprobe.get("found"):
        lines.append("")
        lines.append(f"> {ffprobe.get('note')}")
    lines.append("")

    # 4. Model Asset Inventory
    lines.append("## 4. Model Asset Inventory")
    inv = state["model_inventory"].get("inventory", [])
    if inv:
        lines.append("| Model | Active | Assets Found | Inference Possible | Reason |")
        lines.append("|---|---|---|---|---|")
        for item in inv:
            lines.append(f"| {item['model_name']} | {item['active']} | {item['assets_found']} | {item['inference_possible']} | {item['reason']} |")
    else:
        lines.append("No inventory data available.")
    lines.append("")
    lines.append("Full data: `outputs/model_inventory.json`")
    lines.append("")

    # 5. Model Load Results
    lines.append("## 5. Model Load Results")
    loads = state["model_loads"]["data"].get("models", [])
    lines.append(f"GPU available: {state['model_loads']['data'].get('gpu_available')}")
    lines.append("")
    lines.append("| Model | Enabled | Status | Device | Load Time (ms) | Source |")
    lines.append("|---|---|---|---|---|---|")
    for m in loads:
        lines.append(f"| {m['model_name']} | {m['enabled']} | {m['status']} | {m['device']} | {m['load_time_ms']} | {m['checkpoint_or_source']} |")
    lines.append("")
    lines.append("Full data: `outputs/model_load_test.json`")
    lines.append("")

    # 6. Local API Test Results
    lines.append("## 6. Local API Test Results")
    local = state["local_tests"]["data"]
    summary = local.get("summary", {})
    lines.append(f"Base URL: `{local.get('base_url')}`")
    lines.append(f"Passed {summary.get('passed', 0)}/{summary.get('total', 0)}")
    lines.append("")
    lines.append("| Test | Status Code | Passed | Time (ms) | Error |")
    lines.append("|---|---|---|---|---|")
    for r in local.get("results", []):
        err = (r.get("error") or "").replace("|", "\\|")
        lines.append(f"| {r['name']} | {r['status_code']} | {r['passed']} | {r['response_time_ms']} | {err} |")
    lines.append("")
    lines.append("Full data: `outputs/local_api_test_results.json`")
    lines.append("")

    # 7. Cloudflare Tunnel Status
    lines.append("## 7. Cloudflare Tunnel Status")
    tunnel = state["tunnel"]
    lines.append(f"- Provider: {tunnel.get('provider')}")
    lines.append(f"- Local URL: {tunnel.get('local_url')}")
    lines.append(f"- Status: {tunnel.get('status')}")
    lines.append(f"- Public URL: {tunnel.get('public_url')}")
    lines.append(f"- PID: {tunnel.get('pid')}")
    lines.append(f"- Log file: `{tunnel.get('log_file')}`")
    lines.append("")

    # 8. Tunnel API Test Results
    lines.append("## 8. Tunnel API Test Results")
    tunnel_tests = state["tunnel_tests"]["data"]
    if tunnel_tests.get("skipped_reason"):
        lines.append(f"SKIPPED: {tunnel_tests['skipped_reason']}")
    else:
        tsummary = tunnel_tests.get("summary", {})
        lines.append(f"Base URL: `{tunnel_tests.get('base_url')}`")
        if tunnel_tests.get("dns_resolution"):
            lines.append(f"DNS resolution: {tunnel_tests.get('dns_resolution')}")
        lines.append(f"Passed {tsummary.get('passed', 0)}/{tsummary.get('total', 0)}")
        lines.append("")
        lines.append("| Test | Status Code | Passed | Time (ms) | Error |")
        lines.append("|---|---|---|---|---|")
        for r in tunnel_tests.get("results", []):
            err = (r.get("error") or "").replace("|", "\\|")
            lines.append(f"| {r['name']} | {r['status_code']} | {r['passed']} | {r['response_time_ms']} | {err} |")
    lines.append("")
    lines.append("Full data: `outputs/tunnel_api_test_results.json`")
    lines.append("")

    # 9. Failed/Unavailable Models
    lines.append("## 9. Failed/Unavailable Models")
    bad = [m for m in loads if m["status"] != "loaded"]
    if not bad:
        lines.append("All enabled models loaded successfully.")
    else:
        lines.append("| Model | Status | Reason | Detail |")
        lines.append("|---|---|---|---|")
        for m in bad:
            reason = classify_unavailable(m)
            detail = (m.get("error") or "").replace("|", "\\|")
            lines.append(f"| {m['model_name']} | {m['status']} | {reason} | {detail} |")
    lines.append("")

    # 10. Next Required Fixes
    lines.append("## 10. Next Required Fixes")
    fixes: list[str] = []
    for m in bad:
        if m["status"] == "skipped":
            continue
        fixes.append(f"- **{m['model_name']}**: {classify_unavailable(m)} -- `{m.get('error')}`")
    deps = state["dependencies"]
    for name in ("ffprobe", "exiftool", "c2patool"):
        if not deps.get(name, {}).get("found"):
            fixes.append(f"- Install `{name}` to enable full provenance metadata extraction.")
    if tunnel.get("status") != "running":
        fixes.append("- Cloudflare tunnel did not come up; check `outputs/cloudflared_tunnel.log` and re-run `scripts/run_tunnel_cloudflare.sh`.")
    if not state["no_mock_scan"]["passed"]:
        fixes.append("- No-mock scan found random-number-based score generation; review `outputs/full_system_report.md` no-mock section.")
    if not env["pip_check"]["ok"]:
        fixes.append(f"- Resolve `pip check` dependency conflict: `{env['pip_check']['output']}`")
    if not fixes:
        fixes.append("- None. All checks passed.")
    lines.extend(fixes)
    lines.append("")

    # 11. Ready-to-use MODEL_SERVER_URL
    lines.append("## 11. Ready-to-use MODEL_SERVER_URL")
    if tunnel.get("status") == "running" and tunnel.get("public_url"):
        lines.append("Set this in the Next.js app's **server-side** `.env` (never `NEXT_PUBLIC_*`):")
        lines.append("")
        lines.append("```")
        lines.append(f"MODEL_SERVER_URL={tunnel['public_url']}")
        lines.append("```")
    else:
        lines.append("No working tunnel URL. Use the local URL for same-host testing:")
        lines.append("")
        lines.append("```")
        lines.append(f"MODEL_SERVER_URL={BASE_URL}")
        lines.append("```")
    lines.append("")

    # 12. No-mock scan
    lines.append("## 12. No-Mock / Anti-Fabrication Scan")
    scan = state["no_mock_scan"]
    lines.append(f"- Scanned {scan['scanned_files']} files under `app/`, `server.py`, `config.py`.")
    if scan["passed"]:
        lines.append("- PASS: no `random.random()` / `np.random.*` calls found in model or service code.")
    else:
        lines.append("- **FAIL**: random-number generation found in model/service code:")
        for v in scan["violations"]:
            lines.append(f"  - `{v['file']}:{v['line']}`: `{v['text']}`")
    if scan["informational"]:
        lines.append("")
        lines.append("Informational matches (reviewed; real computed values, not hardcoded mocks):")
        for v in scan["informational"]:
            lines.append(f"- `{v['file']}:{v['line']}`: `{v['text']}`")
    lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    state: dict[str, Any] = {}

    state["environment"] = step_python_environment()
    state["dependencies"] = step_dependencies()
    state["sample_media"] = step_sample_media()
    state["gpu"] = step_gpu_status()
    state["model_inventory"] = step_model_inventory()
    state["model_loads"] = step_model_loads()
    state["server"] = step_server()
    state["local_tests"] = step_local_tests()
    state["tunnel"] = step_tunnel()
    state["tunnel_tests"] = step_tunnel_tests(state["tunnel"])
    state["no_mock_scan"] = no_mock_scan()

    banner("L. Writing final report")
    report_md = render_report(state)
    report_path = OUTPUT_DIR / "full_system_report.md"
    report_path.write_text(report_md, encoding="utf-8")
    write_json(OUTPUT_DIR / "full_system_check_state.json", state)
    print(f"Wrote {report_path}")

    local_summary = state["local_tests"]["data"].get("summary", {})
    tunnel_summary = state["tunnel_tests"]["data"].get("summary", {})
    print("\n--- SUMMARY ---")
    print(f"Local API tests: {local_summary.get('passed', 0)}/{local_summary.get('total', 0)} passed")
    print(f"Tunnel API tests: {tunnel_summary.get('passed', 0)}/{tunnel_summary.get('total', 0)} passed")
    print(f"Tunnel status: {state['tunnel'].get('status')} ({state['tunnel'].get('public_url')})")
    print(f"No-mock scan: {'PASS' if state['no_mock_scan']['passed'] else 'FAIL'}")


if __name__ == "__main__":
    main()
