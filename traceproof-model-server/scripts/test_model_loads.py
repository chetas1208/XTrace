"""Test whether each configured model can actually load.

This instantiates a fresh ModelRegistry (separate from any running server
process) and calls .load() on every enabled model, recording real
success/failure/unavailable status. Nothing here fabricates a "loaded"
result: import errors, missing checkpoints, and CUDA failures are reported
verbatim.

Output: outputs/model_load_test.json
"""

from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.chdir(ROOT)
os.environ.setdefault("HF_HOME", str(ROOT / "model_weights" / "huggingface"))

from config import settings  # noqa: E402

OUTPUT = ROOT / "outputs" / "model_load_test.json"

# Registry key -> best-guess source description, used when the wrapper
# itself doesn't record a checkpoint_path after loading.
CHECKPOINT_HINTS: dict[str, str] = {
    "universal_fake_detect": str(settings.universal_fake_detect_dir / "pretrained_weights" / "fc_weights.pth"),
    "capcheck": "capcheck/ai-human-generated-image-detection (Hugging Face)",
    "openclip": "open_clip_torch pretrained weights (ViT-L-14 / laion2b_s32b_b82k, or ViT-B-32 on CPU)",
    "dire": settings.dire_model_path or "DIRE_MODEL_PATH not set",
    "aasist": str(settings.aasist_dir / "models" / "weights" / "AASIST.pth"),
    "wav2vec2": "garystafford/wav2vec2-deepfake-voice-detector (Hugging Face)",
    "parakeet": str(settings.model_weights_dir / "nvidia-parakeet-tdt-0.6b-v2" / "parakeet-tdt-0.6b-v2.nemo"),
    "rawnet2": settings.rawnet2_model_path or "RAWNET2_MODEL_PATH not set",
    "mesonet": str(settings.mesonet_dir / "weights" / "*.h5"),
    "genconvit": str((settings.hf_home / "Deressa-GenConViT").resolve()),
    "temporal": "heuristic (no checkpoint)",
    "nvidia_vlm": "nvidia/Cosmos-Reason1-7B (Hugging Face, gated; explanation-only)",
}

# Registry key -> the actual `ENABLE_*` setting name in config.py, used so
# "disabled by env" messages name the real env var.
ENV_VAR_NAMES: dict[str, str] = {
    "universal_fake_detect": "ENABLE_UNIVERSAL_FAKE_DETECT",
    "capcheck": "ENABLE_CAPCHECK_IMAGE_DETECTOR",
    "openclip": "ENABLE_OPENCLIP",
    "dire": "ENABLE_DIRE",
    "aasist": "ENABLE_AASIST",
    "wav2vec2": "ENABLE_WAV2VEC2_AUDIO_DETECTOR",
    "parakeet": "ENABLE_PARAKEET",
    "rawnet2": "ENABLE_RAWNET2",
    "mesonet": "ENABLE_MESONET",
    "genconvit": "ENABLE_GENCONVIT",
    "temporal": "ENABLE_TEMPORAL",
    "nvidia_vlm": "ENABLE_VLM",
}

# Order matters: mirrors the GPU placement plan and avoids the AASIST/UFD
# `models` module sys.path collision the wrappers already guard against.
LOAD_ORDER = [
    "universal_fake_detect",
    "capcheck",
    "openclip",
    "dire",
    "aasist",
    "wav2vec2",
    "parakeet",
    "rawnet2",
    "mesonet",
    "genconvit",
    "temporal",
    "nvidia_vlm",
]


def gpu_available() -> bool:
    try:
        import torch

        return bool(torch.cuda.is_available())
    except Exception:
        return False


def free_gpu_memory() -> None:
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass


def rawnet2_entry() -> dict:
    return {
        "model_name": "RawNet2",
        "enabled": settings.enable_rawnet2,
        "status": "skipped",
        "device": "unavailable",
        "checkpoint_or_source": CHECKPOINT_HINTS["rawnet2"],
        "error": "disabled by env (ENABLE_RAWNET2=false)" if not settings.enable_rawnet2 else "RawNet2 wrapper not implemented (no checkpoint or wrapper class exists)",
        "load_time_ms": 0,
    }


def main() -> None:
    from app.registry import ModelRegistry

    registry = ModelRegistry()
    results: list[dict] = []

    for key in LOAD_ORDER:
        if key == "rawnet2":
            results.append(rawnet2_entry())
            continue

        model = registry.get(key)
        entry = {
            "model_name": model.model_name,
            "enabled": model.enabled,
            "status": "skipped",
            "device": model.device if model.enabled else "unavailable",
            "checkpoint_or_source": CHECKPOINT_HINTS.get(key, ""),
            "error": None,
            "load_time_ms": 0,
        }

        if not model.enabled:
            entry["error"] = f"disabled by env ({ENV_VAR_NAMES.get(key, key.upper())}=false)"
            results.append(entry)
            continue

        start = time.perf_counter()
        try:
            model.load()
            entry["status"] = "loaded"
            entry["device"] = model.device
            if model.checkpoint_path:
                entry["checkpoint_or_source"] = str(model.checkpoint_path)
        except FileNotFoundError as exc:
            entry["status"] = "unavailable"
            entry["error"] = str(exc)
        except Exception as exc:
            entry["status"] = "failed"
            entry["error"] = f"{type(exc).__name__}: {exc}"
        finally:
            entry["load_time_ms"] = round((time.perf_counter() - start) * 1000, 2)
            model.model = None
            free_gpu_memory()

        results.append(entry)

    report = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "gpu_available": gpu_available(),
        "models": results,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    for entry in results:
        print(f"{entry['status']:>11}  {entry['model_name']}  ({entry['load_time_ms']} ms)")
        if entry["error"]:
            print(f"             -> {entry['error']}")
    print(f"\nWrote {OUTPUT}")


if __name__ == "__main__":
    main()
