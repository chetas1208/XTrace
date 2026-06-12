from pathlib import Path

from app.services.audio_service import analyze_audio


def run_audio(path: Path):
    return analyze_audio(path)
