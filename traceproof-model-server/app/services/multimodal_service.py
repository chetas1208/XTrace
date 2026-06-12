from pathlib import Path

from app.media import detect_media_type
from app.schemas import ModelSignal
from app.services.audio_service import analyze_audio
from app.services.image_service import analyze_image
from app.services.video_service import analyze_video


def analyze_multimodal(path: Path, content_type: str | None) -> tuple[str, list[ModelSignal]]:
    media_type = detect_media_type(path, content_type)
    if media_type == "image":
        return media_type, analyze_image(path)
    if media_type == "audio":
        return media_type, analyze_audio(path)

    signals, _frames = analyze_video(path)
    return media_type, signals
