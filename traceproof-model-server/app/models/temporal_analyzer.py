from pathlib import Path

import cv2
import numpy as np

from app.media import load_frame_array
from app.models.base import BaseModelWrapper
from app.schemas import ModelSignal, SignalStatus
from app.utils import elapsed_ms


class TemporalAnalyzer(BaseModelWrapper):
    model_name = "Temporal Analyzer"
    modality = "video"

    def load(self) -> None:
        self.loaded = True

    def analyze(self, frame_paths: list[Path]) -> ModelSignal:
        start = self.start_timer()
        if len(frame_paths) < 2:
            return self.failed("Temporal analysis requires at least two extracted frames", elapsed_ms(start))

        histogram_diffs: list[float] = []
        pixel_diffs: list[float] = []
        flow_magnitudes: list[float] = []
        previous_gray: np.ndarray | None = None
        previous_rgb: np.ndarray | None = None

        try:
            for frame_path in frame_paths:
                rgb = load_frame_array(frame_path)
                gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
                if previous_rgb is not None and previous_gray is not None:
                    hist_a = cv2.calcHist([previous_gray], [0], None, [32], [0, 256])
                    hist_b = cv2.calcHist([gray], [0], None, [32], [0, 256])
                    cv2.normalize(hist_a, hist_a)
                    cv2.normalize(hist_b, hist_b)
                    histogram_diffs.append(float(cv2.compareHist(hist_a, hist_b, cv2.HISTCMP_BHATTACHARYYA)))
                    pixel_diffs.append(float(np.mean(np.abs(rgb.astype(np.float32) - previous_rgb.astype(np.float32))) / 255.0))
                    flow = cv2.calcOpticalFlowFarneback(previous_gray, gray, None, 0.5, 3, 15, 3, 5, 1.2, 0)
                    flow_magnitudes.append(float(np.mean(np.linalg.norm(flow, axis=2))))
                previous_gray = gray
                previous_rgb = rgb
        except Exception as exc:
            return self.failed(f"Temporal analysis failed: {exc}", elapsed_ms(start))

        histogram_difference = float(np.mean(histogram_diffs)) if histogram_diffs else 0.0
        average_pixel_difference = float(np.mean(pixel_diffs)) if pixel_diffs else 0.0
        optical_flow_magnitude = float(np.mean(flow_magnitudes)) if flow_magnitudes else 0.0
        flicker_score = max(histogram_difference, average_pixel_difference)

        return ModelSignal(
            model_name=self.model_name,
            modality="video",
            status=SignalStatus.success,
            score=min(1.0, flicker_score),
            confidence=0.55,
            label="temporal_heuristic",
            evidence=[
                f"Computed temporal metrics across {len(frame_paths)} sampled frames",
                f"Histogram difference: {histogram_difference:.4f}",
                f"Average pixel difference: {average_pixel_difference:.4f}",
                f"Optical flow magnitude: {optical_flow_magnitude:.4f}",
            ],
            limitations=["Temporal Analyzer is a real heuristic, not a trained deepfake classifier"],
            raw={
                "frame_count": len(frame_paths),
                "histogram_difference": histogram_difference,
                "average_pixel_difference": average_pixel_difference,
                "optical_flow_magnitude": optical_flow_magnitude,
                "flicker_score": flicker_score,
            },
            runtime_ms=elapsed_ms(start),
            device="cpu",
        )
