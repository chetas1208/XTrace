from app.models.aasist_detector import AASISTDetector
from app.models.capcheck_image_detector import CapcheckImageDetector
from app.models.dire_detector import DIREDetector
from app.models.genconvit_detector import GenConViTDetector
from app.models.mesonet_detector import MesoNetDetector
from app.models.openclip_embedder import OpenCLIPEmbedder
from app.models.temporal_analyzer import TemporalAnalyzer
from app.models.universal_fake_detect import UniversalFakeDetect
from app.models.wav2vec2_audio_detector import Wav2Vec2AudioDetector

__all__ = [
    "AASISTDetector",
    "CapcheckImageDetector",
    "DIREDetector",
    "GenConViTDetector",
    "MesoNetDetector",
    "OpenCLIPEmbedder",
    "TemporalAnalyzer",
    "UniversalFakeDetect",
    "Wav2Vec2AudioDetector",
]
