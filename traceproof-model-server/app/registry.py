from threading import Lock
from typing import Any

from app.models import (
    AASISTDetector,
    CapcheckImageDetector,
    DIREDetector,
    GenConViTDetector,
    MesoNetDetector,
    NvidiaVLM,
    OpenCLIPEmbedder,
    ParakeetASR,
    TemporalAnalyzer,
    UniversalFakeDetect,
    Wav2Vec2AudioDetector,
)
from app.models.base import BaseModelWrapper
from config import settings


class ModelRegistry:
    def __init__(self) -> None:
        self._lock = Lock()
        self._models: dict[str, BaseModelWrapper] = {
            "universal_fake_detect": UniversalFakeDetect(
                settings.enable_universal_fake_detect,
                settings.cuda_image_device,
            ),
            "capcheck": CapcheckImageDetector(settings.enable_capcheck_image_detector, settings.cuda_image_device),
            "openclip": OpenCLIPEmbedder(settings.enable_openclip, settings.cuda_image_device),
            "dire": DIREDetector(settings.enable_dire, settings.cuda_image_device),
            "aasist": AASISTDetector(settings.enable_aasist, settings.cuda_audio_video_device),
            "wav2vec2": Wav2Vec2AudioDetector(settings.enable_wav2vec2_audio_detector, settings.cuda_audio_video_device),
            "parakeet": ParakeetASR(settings.enable_parakeet, settings.cuda_audio_video_device),
            "mesonet": MesoNetDetector(settings.enable_mesonet, settings.cuda_audio_video_device),
            "genconvit": GenConViTDetector(settings.enable_genconvit, settings.cuda_audio_video_device),
            "temporal": TemporalAnalyzer(True, "cpu"),
            "nvidia_vlm": NvidiaVLM(settings.enable_vlm, settings.cuda_image_device),
        }

    def get(self, key: str) -> BaseModelWrapper:
        return self._models[key]

    def statuses(self) -> list[dict[str, Any]]:
        return [model.status() for model in self._models.values()]

    def model_placements(self) -> dict[str, str]:
        return {
            key: model.device if model.loaded else "unloaded"
            for key, model in self._models.items()
        }

    def load_enabled_models(self) -> None:
        with self._lock:
            for model in self._models.values():
                if not model.enabled or model.loaded:
                    continue
                try:
                    model.load()
                except Exception:
                    continue


registry = ModelRegistry()
