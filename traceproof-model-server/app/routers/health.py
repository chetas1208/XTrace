from fastapi import APIRouter
import json
from pathlib import Path

from app.gpu import gpu_info
from app.registry import registry
from app.schemas import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", service="traceproof-model-server", version="0.1.0")


@router.get("/models")
async def models() -> list[dict]:
    return registry.statuses()


@router.get("/gpu")
async def gpu() -> dict:
    return gpu_info()


@router.get("/model-inventory")
async def model_inventory() -> list[dict]:
    inventory_path = Path("outputs/model_inventory.json")
    if not inventory_path.exists():
        return []
    return json.loads(inventory_path.read_text(encoding="utf-8"))
