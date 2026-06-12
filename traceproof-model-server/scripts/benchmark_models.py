from __future__ import annotations

import json
import subprocess
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "outputs" / "benchmark_results.json"
BASE_URL = "http://localhost:8001"


def nvidia_smi() -> str:
    try:
        return subprocess.check_output(
            ["nvidia-smi", "--query-gpu=name,memory.used,memory.free", "--format=csv,noheader"],
            text=True,
        )
    except Exception as exc:
        return str(exc)


def run_folder(endpoint: str, folder: str) -> list[dict]:
    results: list[dict] = []
    for sample in (ROOT / "samples" / folder).glob("*"):
        if not sample.is_file():
            continue
        before = nvidia_smi()
        start = time.perf_counter()
        with sample.open("rb") as handle:
            response = requests.post(f"{BASE_URL}{endpoint}", files={"file": (sample.name, handle)}, timeout=600)
        after = nvidia_smi()
        results.append(
            {
                "sample": str(sample),
                "endpoint": endpoint,
                "status_code": response.status_code,
                "runtime_s": round(time.perf_counter() - start, 3),
                "gpu_before": before,
                "gpu_after": after,
                "response": response.json() if response.headers.get("content-type", "").startswith("application/json") else response.text,
            }
        )
    return results


def main() -> None:
    results = []
    results.extend(run_folder("/v1/analyze/image", "images"))
    results.extend(run_folder("/v1/analyze/audio", "audio"))
    results.extend(run_folder("/v1/analyze/video", "videos"))
    OUTPUT.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
