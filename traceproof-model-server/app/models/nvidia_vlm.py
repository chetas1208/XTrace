from pathlib import Path

from app.models.base import BaseModelWrapper
from app.schemas import ModelSignal, SignalStatus
from app.utils import elapsed_ms


class NvidiaVLM(BaseModelWrapper):
    model_name = "NVIDIA VLM"
    modality = "multimodal"

    def load(self) -> None:
        try:
            import torch
            from transformers import AutoModelForCausalLM, AutoProcessor

            target_device = self.device if torch.cuda.is_available() and self.device.startswith("cuda") else "cpu"
            model_id = "nvidia/Cosmos-Reason1-7B"
            self.processor = AutoProcessor.from_pretrained(model_id, trust_remote_code=True)
            self.model = AutoModelForCausalLM.from_pretrained(
                model_id,
                torch_dtype=torch.float16 if target_device.startswith("cuda") else torch.float32,
                device_map=target_device,
                trust_remote_code=True,
            )
            self.device = target_device
            self.loaded = True
        except Exception as exc:
            self.loaded = False
            self.last_error = str(exc)
            raise

    def analyze(self, media_paths: list[Path], detector_outputs: list[dict]) -> ModelSignal:
        start = self.start_timer()
        disabled = self.ensure_enabled()
        if disabled:
            return disabled
        try:
            if not self.loaded:
                self.load()
        except Exception as exc:
            return self.timed_unavailable(start, f"NVIDIA VLM unavailable or failed to load: {exc}")

        return ModelSignal(
            model_name=self.model_name,
            modality="multimodal",
            status=SignalStatus.skipped,
            score=None,
            confidence=None,
            label="explanation_only",
            evidence=[],
            limitations=["NVIDIA VLM is scaffolded for explanation only; generation adapter is not enabled yet"],
            raw={"media_count": len(media_paths), "detector_output_count": len(detector_outputs)},
            runtime_ms=elapsed_ms(start),
            device=self.device,
        )
