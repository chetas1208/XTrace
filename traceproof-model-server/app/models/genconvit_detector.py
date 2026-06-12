import os
import sys
from pathlib import Path

import numpy as np
import torch
import yaml
from PIL import Image
from torchvision import transforms

from app.models.base import BaseModelWrapper
from app.schemas import ModelSignal, SignalStatus
from app.utils import elapsed_ms, ensure_dir
from config import settings


class GenConViTDetector(BaseModelWrapper):
    model_name = "Deressa/GenConViT"
    modality = "video"

    def _weights_dir(self) -> Path:
        return (settings.hf_home / "Deressa-GenConViT").resolve()

    def _checkpoint_paths(self) -> tuple[Path, Path]:
        weights_dir = self._weights_dir()
        return (
            weights_dir / "genconvit_ed_inference.pth",
            weights_dir / "genconvit_vae_inference.pth",
        )

    def _ensure_weight_layout(self) -> None:
        ed_path, vae_path = self._checkpoint_paths()
        missing = [str(path) for path in [ed_path, vae_path] if not path.exists()]
        if missing:
            raise FileNotFoundError(f"Required GenConViT checkpoint(s) missing: {', '.join(missing)}")

        expected_dir = ensure_dir(self._weights_dir() / "weight")
        for source, name in [
            (ed_path, "genconvit_ed_inference.pth"),
            (vae_path, "genconvit_vae_inference.pth"),
        ]:
            target = expected_dir / name
            if target.exists():
                continue
            try:
                target.symlink_to(source.resolve())
            except OSError:
                import shutil

                shutil.copy2(source, target)

    def _config(self) -> dict:
        config_path = (settings.genconvit_dir / "model" / "config.yaml").resolve()
        if not config_path.exists():
            raise FileNotFoundError("GenConViT source is missing third_party/GenConViT/model/config.yaml")
        return yaml.safe_load(config_path.read_text(encoding="utf-8"))

    def load(self) -> None:
        disabled = self.ensure_enabled()
        if disabled:
            raise RuntimeError(disabled.limitations[0])
        if not settings.genconvit_dir.exists():
            raise FileNotFoundError("GenConViT source repo is missing: third_party/GenConViT")

        self._ensure_weight_layout()
        weights_dir = self._weights_dir()
        config = self._config()
        genconvit_dir = settings.genconvit_dir.resolve()
        repo_path = str(genconvit_dir)
        added_repo_path = repo_path not in sys.path
        old_cwd = Path.cwd()
        try:
            if added_repo_path:
                sys.path.insert(0, repo_path)
            os.chdir(genconvit_dir)
            from model.genconvit import GenConViT  # type: ignore

            os.chdir(weights_dir)
            target_device = self.device if torch.cuda.is_available() and self.device.startswith("cuda") else "cpu"
            use_fp16 = settings.model_precision == "fp16" and target_device.startswith("cuda")
            model = GenConViT(
                config,
                ed="genconvit_ed_inference",
                vae="genconvit_vae_inference",
                net="genconvit",
                fp16=use_fp16,
            )
            model.to(target_device)
            model.eval()
            if use_fp16:
                model.half()

            self.model = model
            self.device = target_device
            self.fp16 = use_fp16
            self.checkpoint_path = weights_dir
            self.loaded = True
        finally:
            os.chdir(old_cwd)
            if added_repo_path:
                sys.path.remove(repo_path)

    def _frame_batch(self, frame_paths: list[Path]) -> torch.Tensor:
        normalize = transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        tensors = []
        for frame_path in frame_paths:
            try:
                image = Image.open(frame_path).convert("RGB").resize((224, 224))
            except Exception:
                continue
            frame = torch.from_numpy(np.array(image, copy=True)).float().permute(2, 0, 1) / 255.0
            tensors.append(normalize(frame))
        if not tensors:
            raise ValueError("No readable video frames for GenConViT")
        batch = torch.stack(tensors, dim=0).to(self.device)
        return batch.half() if getattr(self, "fp16", False) else batch

    def analyze(self, frame_paths: list[Path]) -> ModelSignal:
        start = self.start_timer()
        disabled = self.ensure_enabled()
        if disabled:
            return disabled
        try:
            if not self.loaded:
                self.load()
            batch = self._frame_batch(frame_paths)
            with torch.inference_mode():
                logits = self.model(batch)
                probs = torch.sigmoid(logits).detach().float().cpu()
            if probs.ndim != 2 or probs.shape[1] < 2:
                raise ValueError(f"Unexpected GenConViT output shape: {tuple(probs.shape)}")

            mean_probs = probs.mean(dim=0)
            predicted_idx = int(torch.argmax(mean_probs).item())
            fake_score = float(mean_probs[0].item() if predicted_idx == 0 else abs(1.0 - mean_probs[1].item()))
            fake_score = max(0.0, min(1.0, fake_score))
            label = "synthetic_risk" if predicted_idx == 0 else "lower_synthetic_risk"
            confidence = fake_score if predicted_idx == 0 else 1.0 - fake_score

            return ModelSignal(
                model_name=self.model_name,
                modality="video",
                status=SignalStatus.success,
                score=fake_score,
                confidence=max(0.0, min(1.0, float(confidence))),
                label=label,
                evidence=[f"GenConViT processed {probs.shape[0]} sampled frame outputs"],
                limitations=[
                    "GenConViT is applied to sampled full frames; the upstream face-crop detector is not used in this server adapter"
                ],
                raw={
                    "mean_probabilities": {"class_0_fake": float(mean_probs[0]), "class_1_real": float(mean_probs[1])},
                    "frame_probabilities": probs[:, :2].tolist(),
                },
                runtime_ms=elapsed_ms(start),
                device=self.device,
            )
        except FileNotFoundError as exc:
            return self.timed_unavailable(start, str(exc))
        except Exception as exc:
            detail = str(exc).splitlines()[0]
            return self.failed(f"GenConViT inference failed: {detail}", elapsed_ms(start))
