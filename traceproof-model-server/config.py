from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    model_server_host: str = "0.0.0.0"
    model_server_port: int = 8001

    cuda_image_device: str = "cuda:0"
    cuda_audio_video_device: str = "cuda:1"
    model_precision: str = "fp16"
    load_all_models: bool = False

    enable_universal_fake_detect: bool = True
    enable_capcheck_image_detector: bool = True
    enable_openclip: bool = True
    enable_dire: bool = False
    enable_aasist: bool = True
    enable_wav2vec2_audio_detector: bool = True
    enable_parakeet: bool = True
    enable_rawnet2: bool = False
    enable_mesonet: bool = True
    enable_genconvit: bool = True
    enable_deepfakebench: bool = False
    enable_vlm: bool = False

    universal_fake_detect_dir: Path = Path("third_party/UniversalFakeDetect")
    dire_dir: Path = Path("third_party/DIRE")
    aasist_dir: Path = Path("third_party/aasist")
    mesonet_dir: Path = Path("third_party/MesoNet")
    genconvit_dir: Path = Path("third_party/GenConViT")
    deepfakebench_dir: Path = Path("third_party/DeepfakeBench")
    dire_model_path: str = ""
    rawnet2_model_path: str = ""
    hf_home: Path = Path("model_weights/huggingface")

    model_weights_dir: Path = Path("model_weights")
    output_dir: Path = Path("outputs")

    tunnel_provider: str = "cloudflare"
    public_model_server_url: str = ""


settings = Settings()
