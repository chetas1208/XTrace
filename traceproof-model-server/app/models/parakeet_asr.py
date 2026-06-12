from pathlib import Path

from app.models.base import BaseModelWrapper
from app.schemas import ModelSignal, SignalStatus
from app.utils import elapsed_ms
from config import settings


class ParakeetASR(BaseModelWrapper):
    model_name = "NVIDIA Parakeet ASR"
    modality = "audio"

    def load(self) -> None:
        try:
            import nemo.collections.asr as nemo_asr
            import torch

            target_device = self.device if torch.cuda.is_available() and self.device.startswith("cuda") else "cpu"
            local_model = settings.model_weights_dir / "nvidia-parakeet-tdt-0.6b-v2" / "parakeet-tdt-0.6b-v2.nemo"
            if local_model.exists():
                self.checkpoint_path = local_model
                self.model = nemo_asr.models.ASRModel.restore_from(str(local_model), map_location=target_device)
            else:
                self.model = nemo_asr.models.ASRModel.from_pretrained(model_name="nvidia/parakeet-tdt-0.6b-v2")
            self.model = self.model.to(target_device)
            self.device = target_device
            self.loaded = True
        except Exception as exc:
            self.loaded = False
            self.last_error = str(exc)
            raise

    def analyze(self, audio_path: Path) -> ModelSignal:
        start = self.start_timer()
        disabled = self.ensure_enabled()
        if disabled:
            return disabled
        try:
            if not self.loaded:
                self.load()
            result = self.model.transcribe([str(audio_path)])
            transcript = result[0].text if result and hasattr(result[0], "text") else str(result[0] if result else "")
            return ModelSignal(
                model_name=self.model_name,
                modality="audio",
                status=SignalStatus.success,
                score=None,
                confidence=None,
                label="transcript",
                evidence=["ASR transcript generated"],
                limitations=["NVIDIA Parakeet ASR is transcription support, not a spoof detector"],
                raw={"transcript": transcript},
                runtime_ms=elapsed_ms(start),
                device=self.device,
            )
        except Exception as exc:
            return self.timed_unavailable(
                start,
                f"NVIDIA Parakeet ASR unavailable or failed to load. Install nemo_toolkit[asr] and download nvidia/parakeet-tdt-0.6b-v2. Error: {exc}",
            )
