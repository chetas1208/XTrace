from pathlib import Path

from app.services.video_service import analyze_video


def run_video(path: Path):
    signals, _frames = analyze_video(path)
    return signals
