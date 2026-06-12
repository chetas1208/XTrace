import json
import sys
from pathlib import Path

import librosa
import numpy as np
import torch

from app.models.base import BaseModelWrapper
from app.schemas import ModelSignal, SignalStatus
from app.utils import elapsed_ms
from config import settings


class AASISTDetector(BaseModelWrapper):
    model_name = "AASIST"
    modality = "audio"

    def _checkpoint(self) -> Path | None:
        primary = settings.aasist_dir / "models" / "weights" / "AASIST.pth"
        large = settings.aasist_dir / "models" / "weights" / "AASIST-L.pth"
        return primary if primary.exists() else large if large.exists() else None

    def load(self) -> None:
        disabled = self.ensure_enabled()
        if disabled:
            raise RuntimeError(disabled.limitations[0])
        checkpoint = self._checkpoint()
        if not checkpoint:
            raise FileNotFoundError("Required checkpoint not found: third_party/aasist/models/weights/AASIST.pth")

        config_path = settings.aasist_dir / "config" / ("AASIST-L.conf" if checkpoint.name == "AASIST-L.pth" else "AASIST.conf")
        config = json.loads(config_path.read_text(encoding="utf-8"))
        aasist_repo = str(settings.aasist_dir.resolve())
        added_repo_path = aasist_repo not in sys.path
        saved_model_modules = {
            name: sys.modules.pop(name)
            for name in list(sys.modules)
            if name == "models" or name.startswith("models.")
        }
        if added_repo_path:
            sys.path.insert(0, aasist_repo)
        try:
            from main import get_model  # type: ignore

            target_device = self.device if torch.cuda.is_available() and self.device.startswith("cuda") else "cpu"
            model = get_model(config["model_config"], torch.device(target_device))
        finally:
            if added_repo_path:
                sys.path.remove(aasist_repo)
            for name in list(sys.modules):
                if name == "models" or name.startswith("models."):
                    sys.modules.pop(name)
            sys.modules.update(saved_model_modules)

        state = torch.load(checkpoint, map_location=target_device)
        model.load_state_dict(state)
        model.eval()
        self.model = model
        self.device = target_device
        self.checkpoint_path = checkpoint
        self.nb_samp = int(config["model_config"]["nb_samp"])
        self.loaded = True

    def _load_audio(self, audio_path: Path) -> torch.Tensor:
        waveform, _sample_rate = librosa.load(audio_path, sr=16000, mono=True)
        if waveform.size == 0:
            raise ValueError("Audio file is empty")
        if waveform.shape[0] >= self.nb_samp:
            waveform = waveform[: self.nb_samp]
        else:
            repeats = int(self.nb_samp / waveform.shape[0]) + 1
            waveform = np.tile(waveform, repeats)[: self.nb_samp]
        return torch.tensor(waveform, dtype=torch.float32, device=self.device).unsqueeze(0)

    def analyze(self, audio_path: Path) -> ModelSignal:
        start = self.start_timer()
        disabled = self.ensure_enabled()
        if disabled:
            return disabled
        try:
            if not self.loaded:
                self.load()
            tensor = self._load_audio(audio_path)
            with torch.inference_mode():
                _hidden, logits = self.model(tensor)
                probs = torch.softmax(logits, dim=-1)[0].detach().float().cpu().tolist()
            spoof_prob = float(probs[0])
            bonafide_prob = float(probs[1]) if len(probs) > 1 else 1.0 - spoof_prob
            label = "spoof" if spoof_prob >= bonafide_prob else "bonafide"
            return ModelSignal(
                model_name=self.model_name,
                modality="audio",
                status=SignalStatus.success,
                score=spoof_prob,
                confidence=max(spoof_prob, bonafide_prob),
                label=label,
                evidence=[f"AASIST predicted {label} with probability {max(spoof_prob, bonafide_prob):.4f}"],
                limitations=["AASIST score is an anti-spoofing model signal, not absolute proof of manipulation"],
                raw={"probabilities": {"spoof": spoof_prob, "bonafide": bonafide_prob}},
                runtime_ms=elapsed_ms(start),
                device=self.device,
            )
        except FileNotFoundError as exc:
            return self.timed_unavailable(start, str(exc))
        except Exception as exc:
            return self.failed(f"AASIST inference failed: {exc}", elapsed_ms(start))
