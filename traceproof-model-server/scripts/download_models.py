from __future__ import annotations

import os
from pathlib import Path

from huggingface_hub import snapshot_download
from rich.console import Console

console = Console()
ROOT = Path(__file__).resolve().parents[1]
WEIGHTS = ROOT / "model_weights"
WEIGHTS.mkdir(parents=True, exist_ok=True)


def download_snapshot(model_id: str, local_dir: Path, enabled: bool = True) -> None:
    if not enabled:
        console.print(f"[yellow]SKIP[/yellow] {model_id} disabled by env")
        return
    try:
        snapshot_download(
            repo_id=model_id,
            local_dir=local_dir,
            local_dir_use_symlinks=False,
            resume_download=True,
        )
        console.print(f"[green]OK[/green] downloaded {model_id} -> {local_dir}")
    except Exception as exc:
        console.print(f"[red]FAILED[/red] {model_id}: {exc}")


def main() -> None:
    os.environ.setdefault("HF_HOME", str(WEIGHTS / "huggingface"))
    console.print("OpenCLIP weights are downloaded by open_clip_torch on first load when ENABLE_OPENCLIP=true.")
    download_snapshot("capcheck/ai-human-generated-image-detection", WEIGHTS / "huggingface" / "capcheck-ai-human-generated-image-detection")
    download_snapshot("garystafford/wav2vec2-deepfake-voice-detector", WEIGHTS / "huggingface" / "wav2vec2-deepfake-voice-detector")
    download_snapshot("nvidia/parakeet-tdt-0.6b-v2", WEIGHTS / "nvidia-parakeet-tdt-0.6b-v2")
    download_snapshot("Deressa/GenConViT", WEIGHTS / "huggingface" / "Deressa-GenConViT")
    if os.getenv("ENABLE_VLM", "false").lower() == "true":
        download_snapshot("nvidia/Cosmos-Reason1-7B", WEIGHTS / "nvidia-Cosmos-Reason1-7B")
    else:
        console.print("[yellow]SKIP[/yellow] nvidia/Cosmos-Reason1-7B because ENABLE_VLM=false")

    console.print("Bundled checkpoint expected: UniversalFakeDetect -> third_party/UniversalFakeDetect/pretrained_weights/fc_weights.pth")
    console.print("Manual checkpoint required: DIRE")
    console.print("Bundled checkpoint expected: AASIST -> third_party/aasist/models/weights/AASIST.pth")
    console.print("Bundled checkpoint expected: MesoNet -> third_party/MesoNet/weights/*.h5")
    console.print("Optional later: RawNet2, DeepfakeBench, NVIDIA VLM")
    import subprocess
    subprocess.run(["python3", "scripts/verify_model_assets.py"], check=False)


if __name__ == "__main__":
    main()
