from pathlib import Path

import numpy as np

from app.media import load_image
from app.models.base import BaseModelWrapper
from app.schemas import ModelSignal, SignalStatus
from app.utils import elapsed_ms


class OpenCLIPDetector(BaseModelWrapper):
    model_name = "OpenCLIP"
    modality = "image"

    def load(self) -> None:
        disabled = self.ensure_enabled()
        if disabled:
            raise RuntimeError(disabled.limitations[0])
        try:
            import open_clip
            import torch

            model_name = "ViT-L-14" if self.device.startswith("cuda") else "ViT-B-32"
            pretrained = "laion2b_s32b_b82k" if self.device.startswith("cuda") else "laion2b_s34b_b79k"
            self.model, _, self.preprocess = open_clip.create_model_and_transforms(model_name, pretrained=pretrained)
            target_device = self.device if torch.cuda.is_available() and self.device.startswith("cuda") else "cpu"
            self.device = target_device
            self.model = self.model.to(target_device)
            self.model.eval()
            self.loaded = True
        except Exception as exc:
            self.loaded = False
            self.last_error = str(exc)
            raise

    def analyze(self, image_path: Path) -> ModelSignal:
        start = self.start_timer()
        disabled = self.ensure_enabled()
        if disabled:
            return disabled
        try:
            if not self.loaded:
                self.load()
            import torch

            image = self.preprocess(load_image(image_path)).unsqueeze(0).to(self.device)
            with torch.inference_mode():
                embedding = self.model.encode_image(image)
                embedding = embedding / embedding.norm(dim=-1, keepdim=True)
            vector = embedding.detach().float().cpu().numpy()[0]
            stats = {
                "embedding_dim": int(vector.shape[0]),
                "mean": float(np.mean(vector)),
                "std": float(np.std(vector)),
                "min": float(np.min(vector)),
                "max": float(np.max(vector)),
            }
            return ModelSignal(
                model_name=self.model_name,
                modality="image",
                status=SignalStatus.success,
                score=None,
                confidence=None,
                label=None,
                evidence=["OpenCLIP embedding extracted"],
                limitations=["No trained synthetic-media classifier/prototype file is configured for OpenCLIP scoring"],
                raw={"embedding_stats": stats},
                runtime_ms=elapsed_ms(start),
                device=self.device,
            )
        except Exception as exc:
            return self.failed(f"OpenCLIP failed: {exc}", elapsed_ms(start))
