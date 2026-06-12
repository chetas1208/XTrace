import subprocess
import time
from shutil import which
from pathlib import Path
from typing import Sequence
from uuid import uuid4

from rich.console import Console

console = Console()


def request_id() -> str:
    return f"tp_{uuid4().hex}"


def now_ms() -> float:
    return time.perf_counter() * 1000


def elapsed_ms(start_ms: float) -> float:
    return round(now_ms() - start_ms, 2)


def run_command(command: str, args: Sequence[str], timeout_s: int = 60) -> tuple[int | None, str, str]:
    executable = which(command)
    if not executable and command == "ffmpeg":
        try:
            import imageio_ffmpeg

            executable = imageio_ffmpeg.get_ffmpeg_exe()
        except Exception:
            executable = None
    executable = executable or command
    try:
        result = subprocess.run(
            [executable, *args],
            capture_output=True,
            text=True,
            timeout=timeout_s,
            check=False,
            shell=False,
        )
        return result.returncode, result.stdout, result.stderr
    except subprocess.TimeoutExpired as exc:
        return None, exc.stdout or "", exc.stderr or f"{command} timed out after {timeout_s}s"
    except OSError as exc:
        return None, "", str(exc)


def find_first_existing(paths: list[Path]) -> Path | None:
    for path in paths:
        if path.exists():
            return path
    return None


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path
