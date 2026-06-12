from pathlib import Path

from app.services.image_service import analyze_image


def run_image(path: Path):
    return analyze_image(path)
