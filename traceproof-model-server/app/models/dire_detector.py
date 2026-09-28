from pathlib import Path

from app.models.base import BaseModelWrapper
from app.schemas import ModelSignal
from app.utils import find_first_existing
from config import settings


class DIREDetector(BaseModelWrapper):
    model_name = "DIRE"
    modality = "image"

    def load(self) -> None:
        checkpoint = find_first_existing(
            [settings.model_weights_dir / "DIRE", settings.model_weights_dir / "dire.pth"]
        )
        if not checkpoint:
            raise FileNotFoundError("DIRE checkpoint/config is missing")
        self.checkpoint_path = checkpoint
        raise RuntimeError("DIRE adapter requires project-specific config and checkpoint wiring")

    def analyze(self, image_path: Path) -> ModelSignal:
        start = self.start_timer()
        disabled = self.ensure_enabled()
        if disabled:
            return disabled
        try:
            self.load()
        except FileNotFoundError:
            return self.timed_unavailable(start, "DIRE weights/config are not available. Manual checkpoint required: DIRE")
        except Exception as exc:
            return self.timed_unavailable(start, str(exc))
        return self.timed_unavailable(start, f"No executable DIRE adapter returned output for {image_path.name}")
