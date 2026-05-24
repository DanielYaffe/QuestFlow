"""Normalise per-condition metric values into [0,1] then compute weighted aggregate scores."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from .eval_config import WeightSet

METRIC_NAMES = [
    "clipscore",
    "dinov2_fidelity",
    "fid",
    "lpips_diversity",
    "pixel_art",
    "memorization",
]

# Mapping: metric -> "higher is better"?
HIGHER_IS_BETTER = {
    "clipscore": True,
    "dinov2_fidelity": True,
    "fid": False,           # lower FID is better
    "lpips_diversity": True,
    "pixel_art": True,
    "memorization": True,   # higher distance = less memorised = better
}


@dataclass
class ConditionAggregate:
    condition_id: str
    raw: dict[str, float]
    normalised: dict[str, float]


def _minmax_normalise(values: dict[str, float], higher_better: bool) -> dict[str, float]:
    arr = np.array(list(values.values()), dtype=np.float64)
    finite = arr[np.isfinite(arr)]
    if finite.size == 0:
        return {k: float("nan") for k in values}

    lo, hi = float(finite.min()), float(finite.max())
    if hi - lo < 1e-12:
        return {k: 0.5 for k in values}

    out: dict[str, float] = {}
    for k, v in values.items():
        if not np.isfinite(v):
            out[k] = float("nan")
            continue
        n = (v - lo) / (hi - lo)
        if not higher_better:
            n = 1.0 - n
        out[k] = float(np.clip(n, 0.0, 1.0))
    return out


def normalise(condition_means: dict[str, dict[str, float]]) -> dict[str, dict[str, float]]:
    """condition_means: {metric: {condition_id: mean_value}} → normalised same shape."""
    out: dict[str, dict[str, float]] = {}
    for metric, vals in condition_means.items():
        higher = HIGHER_IS_BETTER.get(metric, True)
        out[metric] = _minmax_normalise(vals, higher)
    return out


def aggregate(
    normalised: dict[str, dict[str, float]],
    weights: WeightSet,
) -> dict[str, float]:
    """Weighted sum per condition → final aggregate score in [0,1]."""
    w = weights.as_dict()
    if abs(sum(w.values()) - 1.0) > 1e-6:
        raise ValueError(f"weights must sum to 1.0; got {sum(w.values())}")

    # Discover the condition ids from the first metric.
    if not normalised:
        return {}
    first_metric = next(iter(normalised.values()))
    condition_ids = list(first_metric.keys())

    out: dict[str, float] = {}
    for cid in condition_ids:
        total = 0.0
        weight_used = 0.0
        for metric, weight in w.items():
            v = normalised.get(metric, {}).get(cid, float("nan"))
            if np.isfinite(v):
                total += weight * v
                weight_used += weight
        out[cid] = total / weight_used if weight_used > 0 else float("nan")
    return out


def rank(aggregate_scores: dict[str, float]) -> pd.DataFrame:
    df = pd.DataFrame(
        [{"condition_id": cid, "score": s} for cid, s in aggregate_scores.items()]
    )
    df = df.sort_values("score", ascending=False, na_position="last").reset_index(drop=True)
    df["rank"] = df.index + 1
    return df
