from fastapi import FastAPI
from rich.console import Console

from app.registry import registry
from app.routers import audio, health, image, multimodal, provenance, video
from config import settings

console = Console()

app = FastAPI(
    title="TraceProofAI Private Model Server",
    version="0.1.0",
    description="Private FastAPI GPU inference service. No auth is enabled by design.",
)

app.include_router(health.router)
app.include_router(image.router)
app.include_router(audio.router)
app.include_router(video.router)
app.include_router(multimodal.router)
app.include_router(provenance.router)


@app.on_event("startup")
async def startup() -> None:
    settings.output_dir.mkdir(parents=True, exist_ok=True)
    settings.model_weights_dir.mkdir(parents=True, exist_ok=True)
    if settings.load_all_models:
        registry.load_enabled_models()
    console.log("[green]TraceProofAI model server ready[/green]")
