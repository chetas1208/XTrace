import json
from pathlib import Path
from shutil import which

from app.media import ffprobe
from app.schemas import ModelSignal, SignalStatus
from app.utils import elapsed_ms, now_ms, run_command


def analyze_provenance(path: Path) -> ModelSignal:
    start = now_ms()
    evidence: list[str] = []
    limitations: list[str] = ["Provenance uncertainty is not direct evidence of synthetic generation."]
    raw: dict = {}
    confidence = 0.25

    # --- ffprobe: container / stream metadata ---
    probe = ffprobe(path)
    raw["ffprobe"] = probe
    if probe["ok"]:
        confidence += 0.25
        for stream in probe["raw"].get("streams", []):
            codec = stream.get("codec_name")
            if stream.get("codec_type") == "video" and codec:
                evidence.append(f"Container reports a {codec} video stream.")
            if stream.get("codec_type") == "audio" and codec:
                evidence.append(f"Container reports a {codec} audio stream.")
    elif which("ffprobe") is None:
        limitations.append("Container metadata could not be read because ffprobe is not installed on the model server.")

    # --- exiftool: EXIF / camera + software metadata ---
    if which("exiftool") is None:
        raw["exiftool"] = {"available": False}
        limitations.append("EXIF metadata could not be read because exiftool is not installed on the model server.")
    else:
        code, stdout, _stderr = run_command("exiftool", ["-json", str(path)], timeout_s=30)
        exif: list = []
        if code == 0:
            try:
                exif = json.loads(stdout or "[]")
            except json.JSONDecodeError:
                exif = []
        raw["exiftool"] = exif[0] if exif else {}
        if exif and any(key in exif[0] for key in ("Make", "Model", "Software", "Encoder")):
            evidence.append("Embedded camera or software metadata is present.")
        else:
            evidence.append("No embedded camera or software metadata is present.")
        confidence += 0.2

    # --- c2patool: C2PA Content Credentials ---
    if which("c2patool") is None:
        raw["c2pa"] = {"available": False}
        limitations.append("Content Credentials could not be checked because c2patool is not installed on the model server.")
    else:
        code, stdout, _stderr = run_command("c2patool", [str(path)], timeout_s=30)
        if code == 0 and stdout.strip():
            raw["c2pa"] = {"manifest": stdout[:20000]}
            evidence.append("A C2PA Content Credentials manifest is embedded in this file.")
            confidence += 0.2
        else:
            # No manifest is the common, expected case; it is a finding, not a failure.
            raw["c2pa"] = {"manifest": None}
            evidence.append("No C2PA Content Credentials manifest is embedded in this file.")

    return ModelSignal(
        model_name="Provenance",
        modality="provenance",
        status=SignalStatus.success if evidence else SignalStatus.unavailable,
        score=None,
        confidence=min(confidence, 0.9),
        label="provenance_metadata",
        evidence=evidence,
        limitations=limitations,
        raw=raw,
        runtime_ms=elapsed_ms(start),
        device="cpu",
    )
