import sys
from pathlib import Path

import cv2
import numpy as np

from app.models.base import BaseModelWrapper
from app.schemas import ModelSignal, SignalStatus
from app.utils import elapsed_ms
from config import settings


class MesoNetDetector(BaseModelWrapper):
    model_name = "MesoNet"
    modality = "video"

    def _checkpoint(self) -> Path | None:
        candidates = [
            settings.mesonet_dir / "weights" / "MesoInception_F2F.h5",
            settings.mesonet_dir / "weights" / "Meso4_F2F.h5",
            settings.mesonet_dir / "weights" / "MesoInception_DF.h5",
            settings.mesonet_dir / "weights" / "Meso4_DF.h5",
        ]
        return next((path for path in candidates if path.exists()), None)

    def load(self) -> None:
        disabled = self.ensure_enabled()
        if disabled:
            raise RuntimeError(disabled.limitations[0])
        checkpoint = self._checkpoint()
        if not checkpoint:
            raise FileNotFoundError("Required MesoNet checkpoint not found under third_party/MesoNet/weights")
        try:
            import tensorflow as tf

            try:
                tf.config.set_visible_devices([], "GPU")
            except RuntimeError:
                pass
        except Exception as exc:
            raise RuntimeError(f"TensorFlow/Keras is required for MesoNet inference but is not installed: {exc}") from exc

        sys.path.insert(0, str(settings.mesonet_dir.resolve()))
        try:
            from classifiers import Meso4, MesoInception4  # type: ignore
        finally:
            if sys.path[0] == str(settings.mesonet_dir.resolve()):
                sys.path.pop(0)

        model = MesoInception4() if "Inception" in checkpoint.name else Meso4()
        model.load(str(checkpoint))
        self.model = model
        self.checkpoint_path = checkpoint
        self.device = "cpu"
        self.loaded = True

    def _frame_batch(self, frame_paths: list[Path]) -> np.ndarray:
        frames = []
        for frame_path in frame_paths:
            image = cv2.imread(str(frame_path), cv2.IMREAD_COLOR)
            if image is None:
                continue
            image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            image = cv2.resize(image, (256, 256)).astype("float32") / 255.0
            frames.append(image)
        if not frames:
            raise ValueError("No readable video frames for MesoNet")
        return np.stack(frames, axis=0)

    def analyze(self, frame_paths: list[Path]) -> ModelSignal:
        start = self.start_timer()
        disabled = self.ensure_enabled()
        if disabled:
            return disabled
        try:
            if not self.loaded:
                self.load()
            batch = self._frame_batch(frame_paths)
            predictions = np.asarray(self.model.predict(batch)).reshape(-1)
            # MesoNet examples report a single sigmoid output. We preserve raw values and treat lower realness as higher risk.
            realness = float(np.mean(predictions))
            risk = 1.0 - realness
            label = "synthetic_risk" if risk >= 0.5 else "lower_synthetic_risk"
            return ModelSignal(
                model_name=self.model_name,
                modality="video",
                status=SignalStatus.success,
                score=risk,
                confidence=max(risk, 1.0 - risk),
                label=label,
                evidence=[f"MesoNet processed {len(predictions)} sampled frames"],
                limitations=["MesoNet output semantics are preserved in raw frame scores; aggregate risk is 1 - mean sigmoid output"],
                raw={"frame_scores": predictions.astype(float).tolist(), "mean_sigmoid": realness},
                runtime_ms=elapsed_ms(start),
                device=self.device,
            )
        except FileNotFoundError as exc:
            return self.timed_unavailable(start, str(exc))
        except Exception as exc:
            return self.timed_unavailable(start, f"MesoNet unavailable or failed to load: {exc}")
