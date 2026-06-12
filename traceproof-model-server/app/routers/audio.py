from fastapi import APIRouter, File, UploadFile

from app.media import save_upload_to_temp
from app.schemas import AnalysisResponse, ModelSignal, SignalStatus
from app.services.audio_service import analyze_audio
from app.services.fusion_service import fuse_signals
from app.services.provenance_service import analyze_provenance
from app.utils import elapsed_ms, now_ms, request_id

router = APIRouter(prefix="/v1/analyze")


@router.post("/audio", response_model=AnalysisResponse)
async def analyze_audio_route(file: UploadFile = File(...)) -> AnalysisResponse:
    start = now_ms()
    rid = request_id()
    path = save_upload_to_temp(file)
    try:
        signals = analyze_audio(path)
        signals.append(analyze_provenance(path))
    except Exception as exc:
        signals = [
            ModelSignal(
                model_name="Audio Pipeline",
                modality="audio",
                status=SignalStatus.failed,
                score=None,
                confidence=None,
                label=None,
                evidence=[],
                limitations=[str(exc)],
                raw={},
                runtime_ms=elapsed_ms(start),
                device="unavailable",
            )
        ]
    return AnalysisResponse(
        request_id=rid,
        media_type="audio",
        file_name=file.filename or path.name,
        signals=signals,
        fusion=fuse_signals(signals),
        runtime_ms=elapsed_ms(start),
    )
