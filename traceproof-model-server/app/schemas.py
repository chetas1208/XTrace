from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field


class SignalStatus(str, Enum):
    success = "success"
    failed = "failed"
    unavailable = "unavailable"
    skipped = "skipped"


Modality = Literal["image", "video", "audio", "provenance", "multimodal"]
MediaType = Literal["image", "audio", "video", "video_with_audio"]
FinalLabel = Literal[
    "LOW_RISK",
    "UNKNOWN_PROVENANCE",
    "UNKNOWN_PROVENANCE_WITH_SYNTHETIC_RISK",
    "HIGH_SYNTHETIC_MEDIA_RISK",
    "NEEDS_HUMAN_REVIEW",
]


class ModelSignal(BaseModel):
    model_name: str
    modality: Modality
    status: SignalStatus
    score: float | None = Field(default=None, ge=0, le=1)
    confidence: float | None = Field(default=None, ge=0, le=1)
    label: str | None = None
    evidence: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    raw: dict[str, Any] = Field(default_factory=dict)
    runtime_ms: float = Field(default=0, ge=0)
    device: str = "unavailable"


class FusionResult(BaseModel):
    risk_score: float | None = Field(default=None, ge=0, le=100)
    confidence: float | None = Field(default=None, ge=0, le=1)
    label: FinalLabel
    strongest_evidence: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)


class AnalysisResponse(BaseModel):
    request_id: str
    media_type: MediaType
    file_name: str
    signals: list[ModelSignal]
    fusion: FusionResult
    runtime_ms: float = Field(ge=0)


class ModelStatus(BaseModel):
    model_name: str
    enabled: bool
    loaded: bool
    status: str
    device: str
    checkpoint_path: str | None = None
    last_error: str | None = None


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str


def unavailable_signal(
    model_name: str,
    modality: Modality,
    limitation: str,
    device: str = "unavailable",
    runtime_ms: float = 0,
) -> ModelSignal:
    return ModelSignal(
        model_name=model_name,
        modality=modality,
        status=SignalStatus.unavailable,
        score=None,
        confidence=None,
        label=None,
        evidence=[],
        limitations=[limitation],
        raw={},
        runtime_ms=runtime_ms,
        device=device,
    )
