from pathlib import Path

import librosa
import torch

from app.models.base import BaseModelWrapper
from app.schemas import ModelSignal, SignalStatus
from app.utils import elapsed_ms


class Wav2Vec2AudioDetector(BaseModelWrapper):
    model_name = "garystafford/wav2vec2-deepfake-voice-detector"
    modality = "audio"

    def load(self) -> None:
        disabled = self.ensure_enabled()
        if disabled:
            raise RuntimeError(disabled.limitations[0])
        try:
            from transformers import AutoFeatureExtractor, AutoModelForAudioClassification

            target_device = self.device if torch.cuda.is_available() and self.device.startswith("cuda") else "cpu"
            self.extractor = AutoFeatureExtractor.from_pretrained(self.model_name)
            self.model = AutoModelForAudioClassification.from_pretrained(self.model_name).to(target_device)
            self.model.eval()
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
            waveform, sample_rate = librosa.load(audio_path, sr=16000, mono=True)
            inputs = self.extractor(waveform, sampling_rate=sample_rate, return_tensors="pt", padding=True)
            inputs = {key: value.to(self.device) for key, value in inputs.items()}
            with torch.inference_mode():
                logits = self.model(**inputs).logits
                probs = torch.softmax(logits, dim=-1)[0].detach().float().cpu().tolist()
            id2label = getattr(self.model.config, "id2label", {})
            probabilities = {str(id2label.get(idx, idx)): float(prob) for idx, prob in enumerate(probs)}
            best_idx = int(max(range(len(probs)), key=lambda idx: probs[idx]))
            best_label = str(id2label.get(best_idx, best_idx))
            spoof_score = max(
                [prob for label, prob in probabilities.items() if any(term in label.lower() for term in ["fake", "spoof", "deepfake", "generated"])],
                default=probs[best_idx],
            )
            return ModelSignal(
                model_name=self.model_name,
                modality="audio",
                status=SignalStatus.success,
                score=float(spoof_score),
                confidence=float(probs[best_idx]),
                label=best_label,
                evidence=[f"Wav2Vec2 audio classifier predicted {best_label} with probability {probs[best_idx]:.4f}"],
                limitations=["ASR transcript is not used as spoof evidence; this signal comes from Wav2Vec2 audio classification"],
                raw={"probabilities": probabilities},
                runtime_ms=elapsed_ms(start),
                device=self.device,
            )
        except Exception as exc:
            return self.failed(f"Wav2Vec2 audio detector failed: {exc}", elapsed_ms(start))
