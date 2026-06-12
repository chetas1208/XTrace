from app.schemas import FusionResult, ModelSignal, SignalStatus


RISK_WEIGHTS = {
    "UniversalFakeDetect": 0.35,
    "capcheck/ai-human-generated-image-detection": 0.35,
    "OpenCLIP": 0.0,
    "DIRE": 0.35,
    "AASIST": 0.45,
    "garystafford/wav2vec2-deepfake-voice-detector": 0.45,
    "MesoNet": 0.35,
    "Deressa/GenConViT": 0.35,
    "Temporal Analyzer": 0.15,
    "Provenance": 0.0,
}


def _agreement(scores: list[float]) -> float:
    if len(scores) < 2:
        return 0.0
    mean = sum(scores) / len(scores)
    variance = sum((score - mean) ** 2 for score in scores) / len(scores)
    return variance**0.5


def fuse_signals(signals: list[ModelSignal]) -> FusionResult:
    weighted_scores: list[tuple[float, float]] = []
    successful_scoring = 0
    limitations: list[str] = []
    strongest: list[str] = []

    for signal in signals:
        if signal.status != SignalStatus.success:
            limitations.extend(signal.limitations or [f"{signal.model_name} did not return a successful signal"])
            continue
        strongest.extend(signal.evidence)
        weight = RISK_WEIGHTS.get(signal.model_name, 0.0)
        if signal.score is not None and weight > 0:
            weighted_scores.append((signal.score, weight))
            successful_scoring += 1

    if successful_scoring < 2:
        return FusionResult(
            risk_score=None,
            confidence=0.25,
            label="NEEDS_HUMAN_REVIEW",
            strongest_evidence=strongest[:8],
            limitations=[
                *limitations,
                "Fewer than two successful real scoring signals were available",
            ],
        )

    risk = sum(score * weight for score, weight in weighted_scores) / sum(weight for _, weight in weighted_scores)
    scores = [score for score, _weight in weighted_scores]
    deviation = _agreement(scores)
    confidence = max(0.2, min(0.9, 0.78 - min(0.35, deviation) - min(0.25, len(limitations) * 0.03)))

    risk_score = round(risk * 100, 2)
    if risk_score < 30:
        label = "LOW_RISK"
    elif risk_score <= 55:
        label = "UNKNOWN_PROVENANCE"
    elif risk_score <= 80:
        label = "UNKNOWN_PROVENANCE_WITH_SYNTHETIC_RISK"
    else:
        label = "HIGH_SYNTHETIC_MEDIA_RISK"

    return FusionResult(
        risk_score=risk_score,
        confidence=round(confidence, 3),
        label=label,  # type: ignore[arg-type]
        strongest_evidence=strongest[:8],
        limitations=limitations,
    )
