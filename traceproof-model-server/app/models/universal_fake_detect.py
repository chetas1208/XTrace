import sys
from pathlib import Path

import torch
import torchvision.transforms as transforms

from app.media import load_image
from app.models.base import BaseModelWrapper
from app.schemas import ModelSignal, SignalStatus
from app.utils import elapsed_ms
from config import settings


class UniversalFakeDetect(BaseModelWrapper):
    model_name = "UniversalFakeDetect"
    modality = "image"

    def _checkpoint(self) -> Path:
        return settings.universal_fake_detect_dir / "pretrained_weights" / "fc_weights.pth"

    def load(self) -> None:
        disabled = self.ensure_enabled()
        if disabled:
            raise RuntimeError(disabled.limitations[0])
        checkpoint = self._checkpoint()
        if not checkpoint.exists():
            raise FileNotFoundError(f"Required checkpoint not found: {checkpoint}")

        sys.path.insert(0, str(settings.universal_fake_detect_dir.resolve()))
        try:
            from models import get_model  # type: ignore
        finally:
            if sys.path[0] == str(settings.universal_fake_detect_dir.resolve()):
                sys.path.pop(0)

        target_device = self.device if torch.cuda.is_available() and self.device.startswith("cuda") else "cpu"
        model = get_model("CLIP:ViT-L/14")
        state = torch.load(checkpoint, map_location="cpu")
        model.fc.load_state_dict(state)
        model = model.to(target_device)
        model.eval()
        self.model = model
        self.device = target_device
        self.checkpoint_path = checkpoint
        self.transform = transforms.Compose(
            [
                transforms.CenterCrop(224),
                transforms.ToTensor(),
                transforms.Normalize(
                    mean=[0.48145466, 0.4578275, 0.40821073],
                    std=[0.26862954, 0.26130258, 0.27577711],
                ),
            ]
        )
        self.loaded = True

    def analyze(self, image_path: Path) -> ModelSignal:
        start = self.start_timer()
        disabled = self.ensure_enabled()
        if disabled:
            return disabled
        try:
            if not self.loaded:
                self.load()
            image = self.transform(load_image(image_path)).unsqueeze(0).to(self.device)
            with torch.inference_mode():
                logit = self.model(image).flatten()[0]
                risk = float(torch.sigmoid(logit).detach().cpu().item())
            label = "synthetic_risk" if risk >= 0.5 else "lower_synthetic_risk"
            return ModelSignal(
                model_name=self.model_name,
                modality="image",
                status=SignalStatus.success,
                score=risk,
                confidence=max(risk, 1.0 - risk),
                label=label,
                evidence=[f"UniversalFakeDetect returned synthetic-risk probability {risk:.4f}"],
                limitations=["Model probability is a detector signal, not absolute fake/real truth"],
                raw={"synthetic_probability": risk, "checkpoint": str(self.checkpoint_path)},
                runtime_ms=elapsed_ms(start),
                device=self.device,
            )
        except FileNotFoundError as exc:
            return self.timed_unavailable(start, str(exc))
        except Exception as exc:
            return self.failed(f"UniversalFakeDetect inference failed: {exc}", elapsed_ms(start))
