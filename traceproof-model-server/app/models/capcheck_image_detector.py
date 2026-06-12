from pathlib import Path

import numpy as np
import torch

from app.media import load_image
from app.models.base import BaseModelWrapper
from app.schemas import ModelSignal, SignalStatus
from app.utils import elapsed_ms


class CapcheckImageDetector(BaseModelWrapper):
    model_name = "capcheck/ai-human-generated-image-detection"
    modality = "image"

    def load(self) -> None:
        disabled = self.ensure_enabled()
        if disabled:
            raise RuntimeError(disabled.limitations[0])
        try:
            from transformers import AutoImageProcessor, AutoModelForImageClassification

            target_device = self.device if torch.cuda.is_available() and self.device.startswith("cuda") else "cpu"
            self.processor = AutoImageProcessor.from_pretrained(self.model_name)
            self.model = AutoModelForImageClassification.from_pretrained(self.model_name).to(target_device)
            self.model.eval()
            self.device = target_device
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
            image = load_image(image_path).resize((224, 224))
            inputs = self.processor(
                images=np.asarray(image),
                return_tensors="pt",
                input_data_format="channels_last",
            )
            inputs = {key: value.to(self.device) for key, value in inputs.items()}
            with torch.inference_mode():
                logits = self.model(**inputs).logits
                probs = torch.softmax(logits, dim=-1)[0].detach().float().cpu().tolist()
            id2label = getattr(self.model.config, "id2label", {})
            probabilities = {str(id2label.get(idx, idx)): float(prob) for idx, prob in enumerate(probs)}
            best_idx = int(max(range(len(probs)), key=lambda idx: probs[idx]))
            best_label = str(id2label.get(best_idx, best_idx))
            synthetic_score = max(
                [prob for label, prob in probabilities.items() if any(term in label.lower() for term in ["ai", "fake", "synthetic", "generated"])],
                default=probs[best_idx],
            )
            return ModelSignal(
                model_name=self.model_name,
                modality="image",
                status=SignalStatus.success,
                score=float(synthetic_score),
                confidence=float(probs[best_idx]),
                label=best_label,
                evidence=[f"capcheck classifier predicted {best_label} with probability {probs[best_idx]:.4f}"],
                limitations=["Score uses the model's published labels; inspect raw probabilities for class semantics"],
                raw={"probabilities": probabilities},
                runtime_ms=elapsed_ms(start),
                device=self.device,
            )
        except Exception as exc:
            return self.failed(f"capcheck image detector failed: {exc}", elapsed_ms(start))
