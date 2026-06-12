"""Schema validation helpers for model server API responses.

These checks intentionally validate field *presence*, not exact value
types/ranges (Pydantic already enforces those server-side). They exist so
test scripts can confirm a response is shaped like an `AnalysisResponse`
even when individual model signals report `unavailable`/`failed`.
"""

from __future__ import annotations

from typing import Any

REQUIRED_RESPONSE_FIELDS = ["request_id", "media_type", "file_name", "signals", "fusion", "runtime_ms"]

REQUIRED_SIGNAL_FIELDS = [
    "model_name",
    "modality",
    "status",
    "score",
    "confidence",
    "label",
    "evidence",
    "limitations",
    "raw",
    "runtime_ms",
    "device",
]

REQUIRED_FUSION_FIELDS = ["risk_score", "confidence", "label", "strongest_evidence", "limitations"]


def validate_analysis_response(data: Any) -> list[str]:
    """Return a list of human-readable validation errors. Empty list means valid."""
    errors: list[str] = []

    if not isinstance(data, dict):
        return [f"response is not a JSON object: {type(data).__name__}"]

    for field in REQUIRED_RESPONSE_FIELDS:
        if field not in data:
            errors.append(f"missing top-level field '{field}'")

    signals = data.get("signals")
    if signals is not None:
        if not isinstance(signals, list):
            errors.append("'signals' is not a list")
        elif not signals:
            errors.append("'signals' is empty")
        else:
            for index, signal in enumerate(signals):
                if not isinstance(signal, dict):
                    errors.append(f"signals[{index}] is not an object")
                    continue
                for field in REQUIRED_SIGNAL_FIELDS:
                    if field not in signal:
                        name = signal.get("model_name", "?")
                        errors.append(f"signals[{index}] ('{name}') missing field '{field}'")

    fusion = data.get("fusion")
    if fusion is not None:
        if not isinstance(fusion, dict):
            errors.append("'fusion' is not an object")
        else:
            for field in REQUIRED_FUSION_FIELDS:
                if field not in fusion:
                    errors.append(f"fusion missing field '{field}'")

    return errors
