from __future__ import annotations

import json
import os
from pathlib import Path

from huggingface_hub import snapshot_download

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "outputs" / "model_inventory.json"


def exists(path: str) -> bool:
    return (ROOT / path).exists()


def hf_check(model_id: str) -> tuple[bool, str]:
    try:
        snapshot_download(repo_id=model_id, local_dir=ROOT / "model_weights" / "huggingface" / model_id.replace("/", "-"))
        return True, "Hugging Face snapshot available"
    except Exception as exc:
        return False, f"Hugging Face download/load check failed: {exc}"


def item(model_name: str, active: bool, required_assets: list[str], assets_found: bool, inference_possible: bool, reason: str) -> dict:
    return {
        "model_name": model_name,
        "active": active,
        "required_assets": required_assets,
        "assets_found": assets_found,
        "inference_possible": inference_possible,
        "reason": reason,
    }


def main() -> None:
    os.environ.setdefault("HF_HOME", str(ROOT / "model_weights" / "huggingface"))
    inventory: list[dict] = []

    ufd_path = "third_party/UniversalFakeDetect/pretrained_weights/fc_weights.pth"
    inventory.append(item("UniversalFakeDetect", True, [ufd_path], exists(ufd_path), exists(ufd_path), "checkpoint found" if exists(ufd_path) else f"missing {ufd_path}"))

    for model_id in [
        "capcheck/ai-human-generated-image-detection",
        "garystafford/wav2vec2-deepfake-voice-detector",
    ]:
        ok, reason = hf_check(model_id)
        inventory.append(item(model_id, True, [model_id], ok, ok, reason))

    genconvit_assets = [
        "third_party/GenConViT/model/config.yaml",
        "model_weights/huggingface/Deressa-GenConViT/genconvit_ed_inference.pth",
        "model_weights/huggingface/Deressa-GenConViT/genconvit_vae_inference.pth",
    ]
    genconvit_hf_ok, genconvit_reason = hf_check("Deressa/GenConViT")
    genconvit_found = genconvit_hf_ok and all(exists(path) for path in genconvit_assets)
    inventory.append(
        item(
            "Deressa/GenConViT",
            True,
            genconvit_assets,
            genconvit_found,
            genconvit_found,
            "source repo, HF checkpoints, and frame adapter available" if genconvit_found else genconvit_reason,
        )
    )

    inventory.append(item("OpenCLIP", True, ["open_clip_torch pretrained weights"], True, True, "package-managed pretrained weights"))

    aasist_paths = [
        "third_party/aasist/models/weights/AASIST.pth",
        "third_party/aasist/models/weights/AASIST-L.pth",
    ]
    aasist_found = any(exists(path) for path in aasist_paths)
    inventory.append(item("AASIST", True, aasist_paths, aasist_found, aasist_found, "checkpoint found" if aasist_found else "missing AASIST checkpoint"))

    parakeet_path = "model_weights/nvidia-parakeet-tdt-0.6b-v2/parakeet-tdt-0.6b-v2.nemo"
    parakeet_found = exists(parakeet_path)
    inventory.append(item("NVIDIA Parakeet ASR", True, [parakeet_path], parakeet_found, parakeet_found, "local .nemo checkpoint found" if parakeet_found else "missing Parakeet .nemo"))

    mesonet_paths = [
        "third_party/MesoNet/weights/Meso4_DF.h5",
        "third_party/MesoNet/weights/Meso4_F2F.h5",
        "third_party/MesoNet/weights/MesoInception_DF.h5",
        "third_party/MesoNet/weights/MesoInception_F2F.h5",
    ]
    mesonet_found = any(exists(path) for path in mesonet_paths)
    try:
        import tensorflow  # noqa: F401
        tf_ok = True
    except Exception:
        tf_ok = False
    inventory.append(item("MesoNet", True, mesonet_paths, mesonet_found, mesonet_found and tf_ok, "checkpoint found and TensorFlow available" if mesonet_found and tf_ok else "checkpoint found but TensorFlow unavailable" if mesonet_found else "missing MesoNet weights"))

    inventory.append(item("DIRE", False, ["DIRE_MODEL_PATH"], bool(os.getenv("DIRE_MODEL_PATH")), False, "optional; requires manual DIRE_MODEL_PATH and adapter smoke test"))
    inventory.append(item("RawNet2", False, ["RAWNET2_MODEL_PATH"], bool(os.getenv("RAWNET2_MODEL_PATH")), False, "optional later"))
    inventory.append(item("DeepfakeBench", False, ["third_party/DeepfakeBench"], exists("third_party/DeepfakeBench"), False, "benchmark/evaluation framework, not core live inference"))
    inventory.append(item("NVIDIA VLM", False, ["nvidia/Cosmos-Reason1-7B or VILA/NVILA"], False, False, "optional explanation only"))

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(inventory, indent=2), encoding="utf-8")
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
