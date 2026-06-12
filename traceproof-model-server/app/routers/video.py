from fastapi import APIRouter, File, UploadFile

from app.media import detect_media_type, save_upload_to_temp
from app.schemas import AnalysisResponse, ModelSignal, SignalStatus
from app.services.fusion_service import fuse_signals
from app.services.provenance_service import analyze_provenance
from app.services.video_service import analyze_video
from app.utils import elapsed_ms, now_ms, request_id

router = APIRouter(prefix="/v1/analyze")


@router.post("/video", response_model=AnalysisResponse)
async def analyze_video_route(file: UploadFile = File(...)) -> AnalysisResponse:
    start = now_ms()
    rid = request_id()
    path = save_upload_to_temp(file)
    media_type = detect_media_type(path, file.content_type)
    try:
        signals, _frames = analyze_video(path)
        signals.append(analyze_provenance(path))
    except Exception as exc:
        signals = [
            ModelSignal(
                model_name="Video Pipeline",
                modality="video",
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
        media_type=media_type if media_type in {"video", "video_with_audio"} else "video",
        file_name=file.filename or path.name,
        signals=signals,
        fusion=fuse_signals(signals),
        runtime_ms=elapsed_ms(start),
    )
