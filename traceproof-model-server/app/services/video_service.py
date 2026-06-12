from pathlib import Path

from app.media import extract_audio_from_video, extract_video_frames
from app.registry import registry
from app.schemas import ModelSignal
from app.services.audio_service import analyze_audio


def analyze_video(path: Path) -> tuple[list[ModelSignal], list[Path]]:
    signals: list[ModelSignal] = []
    frames = extract_video_frames(path)
    signals.append(registry.get("temporal").analyze(frames))  # type: ignore[attr-defined]
    signals.append(registry.get("mesonet").analyze(frames))  # type: ignore[attr-defined]
    signals.append(registry.get("genconvit").analyze(frames))  # type: ignore[attr-defined]

    audio_path = extract_audio_from_video(path)
    if audio_path:
        signals.extend(analyze_audio(audio_path, normalize=False))
    return signals, frames
