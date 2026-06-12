from pathlib import Path

from app.media import normalize_audio
from app.registry import registry
from app.schemas import ModelSignal


def analyze_audio(path: Path, normalize: bool = True) -> list[ModelSignal]:
    audio_path = normalize_audio(path) if normalize else path
    return [
        registry.get("aasist").analyze(audio_path),  # type: ignore[attr-defined]
        registry.get("wav2vec2").analyze(audio_path),  # type: ignore[attr-defined]
        registry.get("parakeet").analyze(audio_path),  # type: ignore[attr-defined]
    ]
