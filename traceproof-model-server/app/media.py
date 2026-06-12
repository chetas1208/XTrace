import json
import shutil
import tempfile
from pathlib import Path

import cv2
import numpy as np
from fastapi import UploadFile
from PIL import Image

from app.utils import ensure_dir, run_command
from config import settings


def save_upload_to_temp(file: UploadFile) -> Path:
    suffix = Path(file.filename or "upload").suffix
    upload_dir = ensure_dir(settings.output_dir / "uploads")
    handle = tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=upload_dir)
    with handle:
        shutil.copyfileobj(file.file, handle)
    return Path(handle.name)


def ffprobe(path: Path) -> dict:
    code, stdout, stderr = run_command(
        "ffprobe",
        ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)],
        timeout_s=30,
    )
    if code != 0:
        return {"ok": False, "error": stderr or "ffprobe failed", "raw": {}}
    try:
        raw = json.loads(stdout)
    except json.JSONDecodeError:
        return {"ok": False, "error": "ffprobe returned invalid JSON", "raw": {"stdout": stdout, "stderr": stderr}}
    return {"ok": True, "error": None, "raw": raw}


def detect_media_type(path: Path, content_type: str | None) -> str:
    content_type = content_type or ""
    suffix = path.suffix.lower().lstrip(".")
    if content_type.startswith("image/") or suffix in {"jpg", "jpeg", "png", "webp"}:
        return "image"
    if content_type.startswith("audio/") or suffix in {"wav", "mp3", "m4a"}:
        return "audio"
    if content_type.startswith("video/") or suffix in {"mp4", "mov", "webm"}:
        info = ffprobe(path)
        streams = info.get("raw", {}).get("streams", []) if info.get("ok") else []
        has_audio = any(stream.get("codec_type") == "audio" for stream in streams)
        return "video_with_audio" if has_audio else "video"
    return "image"


def extract_video_frames(path: Path, max_frames: int = 12) -> list[Path]:
    frames_dir = ensure_dir(settings.output_dir / "frames" / path.stem)
    pattern = frames_dir / "frame-%03d.png"
    code, _stdout, stderr = run_command(
        "ffmpeg",
        ["-y", "-i", str(path), "-vf", f"fps=1,scale=640:-1", "-frames:v", str(max_frames), str(pattern)],
        timeout_s=120,
    )
    if code != 0:
        raise RuntimeError(stderr or "ffmpeg failed to extract frames")
    return sorted(frames_dir.glob("frame-*.png"))


def extract_audio_from_video(path: Path) -> Path | None:
    audio_path = settings.output_dir / "audio" / f"{path.stem}.wav"
    ensure_dir(audio_path.parent)
    code, _stdout, _stderr = run_command(
        "ffmpeg",
        ["-y", "-i", str(path), "-vn", "-ac", "1", "-ar", "16000", str(audio_path)],
        timeout_s=120,
    )
    if code != 0 or not audio_path.exists() or audio_path.stat().st_size == 0:
        return None
    return audio_path


def normalize_audio(path: Path) -> Path:
    normalized = settings.output_dir / "audio" / f"{path.stem}_16k_mono.wav"
    ensure_dir(normalized.parent)
    code, _stdout, stderr = run_command(
        "ffmpeg",
        ["-y", "-i", str(path), "-ac", "1", "-ar", "16000", str(normalized)],
        timeout_s=120,
    )
    if code != 0:
        raise RuntimeError(stderr or "ffmpeg failed to normalize audio")
    return normalized


def load_image(path: Path) -> Image.Image:
    return Image.open(path).convert("RGB")


def load_frame_array(path: Path) -> np.ndarray:
    image = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"Could not load frame {path}")
    return cv2.cvtColor(image, cv2.COLOR_BGR2RGB)


def cleanup_old_files() -> None:
    # Hook for cron/systemd cleanup. Kept explicit so request paths never delete active uploads.
    return None
