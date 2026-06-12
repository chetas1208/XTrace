from pathlib import Path

from app.media import detect_media_type
from app.registry import registry
from app.schemas import ModelSignal
from app.services.audio_service import analyze_audio
from app.services.image_service import analyze_image
from app.services.video_service import analyze_video


def analyze_multimodal(path: Path, content_type: str | None) -> tuple[str, list[ModelSignal]]:
    media_type = detect_media_type(path, content_type)
    if media_type == "image":
        signals = analyze_image(path)
        signals.append(registry.get("nvidia_vlm").analyze([path], [signal.model_dump() for signal in signals]))  # type: ignore[attr-defined]
        return media_type, signals
    if media_type == "audio":
        return media_type, analyze_audio(path)

    signals, frames = analyze_video(path)
    signals.append(registry.get("nvidia_vlm").analyze(frames[:4], [signal.model_dump() for signal in signals]))  # type: ignore[attr-defined]
    return media_type, signals
