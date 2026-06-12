from typing import Any

from app.registry import registry


def gpu_info() -> dict[str, Any]:
    try:
        import torch
    except Exception as exc:  # pragma: no cover - depends on host
        return {
            "cuda_available": False,
            "error": str(exc),
            "gpu_count": 0,
            "gpus": [],
            "model_placements": registry.model_placements(),
        }

    gpus: list[dict[str, Any]] = []
    if torch.cuda.is_available():
        for index in range(torch.cuda.device_count()):
            props = torch.cuda.get_device_properties(index)
            gpus.append(
                {
                    "index": index,
                    "name": props.name,
                    "total_memory_mb": round(props.total_memory / 1024 / 1024, 2),
                    "allocated_memory_mb": round(torch.cuda.memory_allocated(index) / 1024 / 1024, 2),
                    "reserved_memory_mb": round(torch.cuda.memory_reserved(index) / 1024 / 1024, 2),
                }
            )

    return {
        "cuda_available": torch.cuda.is_available(),
        "gpu_count": torch.cuda.device_count() if torch.cuda.is_available() else 0,
        "gpus": gpus,
        "model_placements": registry.model_placements(),
    }
