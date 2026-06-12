from pathlib import Path

from app.media import detect_media_type
from app.schemas import AnalysisResponse
from app.services.fusion_service import fuse_signals
from app.services.multimodal_service import analyze_multimodal
from app.services.provenance_service import analyze_provenance
from app.utils import elapsed_ms, now_ms, request_id


def run_full_pipeline(path: Path, content_type: str | None = None) -> AnalysisResponse:
    start = now_ms()
    media_type = detect_media_type(path, content_type)
    inferred_type, signals = analyze_multimodal(path, content_type)
    signals.append(analyze_provenance(path))
    return AnalysisResponse(
        request_id=request_id(),
        media_type=inferred_type or media_type,
        file_name=path.name,
        signals=signals,
        fusion=fuse_signals(signals),
        runtime_ms=elapsed_ms(start),
    )
