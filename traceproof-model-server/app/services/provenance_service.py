import json
from pathlib import Path

from app.media import ffprobe
from app.schemas import ModelSignal, SignalStatus
from app.utils import elapsed_ms, now_ms, run_command


def analyze_provenance(path: Path) -> ModelSignal:
    start = now_ms()
    evidence: list[str] = []
    limitations: list[str] = ["Provenance uncertainty is not direct evidence of synthetic generation"]
    raw: dict = {}
    confidence = 0.25

    probe = ffprobe(path)
    raw["ffprobe"] = probe
    if probe["ok"]:
        confidence += 0.25
        streams = probe["raw"].get("streams", [])
        for stream in streams:
            if stream.get("codec_type") == "video" and stream.get("codec_name"):
                evidence.append(f"ffprobe detected {stream['codec_name']} video stream")
            if stream.get("codec_type") == "audio" and stream.get("codec_name"):
                evidence.append(f"ffprobe detected {stream['codec_name']} audio stream")
    else:
        limitations.append(f"ffprobe unavailable or failed: {probe['error']}")

    code, stdout, stderr = run_command("exiftool", ["-json", str(path)], timeout_s=30)
    if code == 0:
        try:
            exif = json.loads(stdout or "[]")
        except json.JSONDecodeError:
            exif = []
            limitations.append("exiftool returned invalid JSON")
        raw["exiftool"] = exif[0] if exif else {}
        if exif and any(key in exif[0] for key in ("Make", "Model", "Software", "Encoder")):
            evidence.append("exiftool returned camera/software metadata")
        else:
            evidence.append("EXIF camera metadata missing")
        confidence += 0.2
    else:
        raw["exiftool"] = {"stderr": stderr, "exit_code": code}
        limitations.append("exiftool unavailable or failed")

    code, stdout, stderr = run_command("c2patool", [str(path), "--json"], timeout_s=30)
    if code == 0:
        raw["c2pa"] = {"stdout": stdout[:20000]}
        evidence.append("c2patool returned C2PA manifest data")
        confidence += 0.2
    else:
        raw["c2pa"] = {"stderr": stderr, "exit_code": code}
        limitations.append("c2patool unavailable or C2PA manifest not found")

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
