from fastapi import APIRouter, File, UploadFile

from app.media import detect_media_type, save_upload_to_temp
from app.schemas import AnalysisResponse
from app.services.fusion_service import fuse_signals
from app.services.provenance_service import analyze_provenance
from app.utils import elapsed_ms, now_ms, request_id

router = APIRouter(prefix="/v1/analyze")


@router.post("/provenance", response_model=AnalysisResponse)
async def analyze_provenance_route(file: UploadFile = File(...)) -> AnalysisResponse:
    start = now_ms()
    rid = request_id()
    path = save_upload_to_temp(file)
    media_type = detect_media_type(path, file.content_type)
    signals = [analyze_provenance(path)]
    return AnalysisResponse(
        request_id=rid,
        media_type=media_type,  # type: ignore[arg-type]
        file_name=file.filename or path.name,
        signals=signals,
        fusion=fuse_signals(signals),
        runtime_ms=elapsed_ms(start),
    )
