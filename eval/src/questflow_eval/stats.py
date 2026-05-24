"""Bootstrap confidence intervals."""
from __future__ import annotations

import numpy as np


def bootstrap_mean_ci(
    values: np.ndarray,
    *,
    n: int = 1000,
    ci: float = 0.95,
    rng: np.random.Generator | None = None,
) -> tuple[float, float, float]:
    """Returns (mean, lower, upper). NaNs are ignored. Empty input → (nan, nan, nan)."""
    vals = np.asarray(values, dtype=np.float64)
    vals = vals[~np.isnan(vals)]
    if vals.size == 0:
        return (float("nan"), float("nan"), float("nan"))
    if vals.size == 1:
        v = float(vals[0])
        return (v, v, v)

    rng = rng or np.random.default_rng(0)
    idx = rng.integers(0, vals.size, size=(n, vals.size))
    means = vals[idx].mean(axis=1)
    alpha = (1.0 - ci) / 2.0
    lo = float(np.quantile(means, alpha))
    hi = float(np.quantile(means, 1.0 - alpha))
    return (float(vals.mean()), lo, hi)
