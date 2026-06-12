# Model Weights

This directory stores downloaded or manually placed model checkpoints.

Automatic downloads:

- `capcheck/ai-human-generated-image-detection`
- `garystafford/wav2vec2-deepfake-voice-detector`
- `nvidia/parakeet-tdt-0.6b-v2`
- `Deressa/GenConViT`
- `nvidia/Cosmos-Reason1-7B` only when `ENABLE_VLM=true`

Bundled in cloned repositories:

- UniversalFakeDetect
- AASIST
- MesoNet

Manual/optional later:

- DIRE
- RawNet2
- DeepfakeBench

Wrappers return `unavailable` until the required real checkpoint and adapter are present.
