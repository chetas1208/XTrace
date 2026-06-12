from __future__ import annotations

from pathlib import Path

import requests
from rich.console import Console

console = Console()
BASE_URL = "http://localhost:8001"
ROOT = Path(__file__).resolve().parents[1]


def post_sample(endpoint: str, folder: str) -> None:
    sample_dir = ROOT / "samples" / folder
    files = [path for path in sample_dir.iterdir() if path.is_file()]
    if not files:
        console.print(f"[yellow]SKIP[/yellow] no sample files in {sample_dir}")
        return
    sample = files[0]
    with sample.open("rb") as handle:
        response = requests.post(f"{BASE_URL}{endpoint}", files={"file": (sample.name, handle)}, timeout=300)
    console.print(endpoint, response.status_code, response.json())


def main() -> None:
    console.print("GET /health", requests.get(f"{BASE_URL}/health", timeout=10).json())
    console.print("GET /models", requests.get(f"{BASE_URL}/models", timeout=10).json())
    post_sample("/v1/analyze/image", "images")
    post_sample("/v1/analyze/audio", "audio")
    post_sample("/v1/analyze/video", "videos")


if __name__ == "__main__":
    main()
