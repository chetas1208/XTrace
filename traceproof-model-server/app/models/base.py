from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

from app.schemas import ModelSignal, SignalStatus, unavailable_signal
from app.utils import elapsed_ms, now_ms


class BaseModelWrapper(ABC):
    model_name: str
    modality: str

    def __init__(self, enabled: bool, device: str, checkpoint_path: Path | None = None) -> None:
        self.enabled = enabled
        self.device = device
        self.checkpoint_path = checkpoint_path
        self.loaded = False
        self.last_error: str | None = None
        self.model: Any = None

    def status(self) -> dict[str, Any]:
        return {
            "model_name": self.model_name,
            "enabled": self.enabled,
            "loaded": self.loaded,
            "status": "loaded" if self.loaded else ("disabled" if not self.enabled else "not_loaded"),
            "device": self.device if self.enabled else "unavailable",
            "checkpoint_path": str(self.checkpoint_path) if self.checkpoint_path else None,
            "last_error": self.last_error,
        }

    def unavailable(self, limitation: str, runtime_ms: float = 0) -> ModelSignal:
        self.last_error = limitation
        return unavailable_signal(
            self.model_name,
            self.modality,  # type: ignore[arg-type]
            limitation,
            device="unavailable",
            runtime_ms=runtime_ms,
        )

    def failed(self, limitation: str, runtime_ms: float = 0) -> ModelSignal:
        self.last_error = limitation
        return ModelSignal(
            model_name=self.model_name,
            modality=self.modality,  # type: ignore[arg-type]
            status=SignalStatus.failed,
            score=None,
            confidence=None,
            label=None,
            evidence=[],
            limitations=[limitation],
            raw={},
            runtime_ms=runtime_ms,
            device=self.device if self.enabled else "unavailable",
        )

    def ensure_enabled(self) -> ModelSignal | None:
        if not self.enabled:
            return self.unavailable(f"{self.model_name} is disabled by configuration")
        return None

    @abstractmethod
    def load(self) -> None:
        raise NotImplementedError

    def timed_unavailable(self, start_ms: float, limitation: str) -> ModelSignal:
        return self.unavailable(limitation, runtime_ms=elapsed_ms(start_ms))

    def start_timer(self) -> float:
        return now_ms()
