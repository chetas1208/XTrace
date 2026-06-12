from pathlib import Path

from app.registry import registry
from app.schemas import ModelSignal


def analyze_image(path: Path) -> list[ModelSignal]:
    return [
        registry.get("universal_fake_detect").analyze(path),  # type: ignore[attr-defined]
        registry.get("capcheck").analyze(path),  # type: ignore[attr-defined]
        registry.get("openclip").analyze(path),  # type: ignore[attr-defined]
        registry.get("dire").analyze(path),  # type: ignore[attr-defined]
    ]
