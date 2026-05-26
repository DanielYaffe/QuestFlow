"""Memorization NN — minimum DINOv2 cosine distance from each generated image to a comparison set.

The interpretation depends on what's in `comparison_set`:
- **Training images**: direct memorisation check. Low distances flag the LoRA
  reproducing specific samples it was trained on.
- **Held-out references**: "resemblance to nearest unseen sprite" — catches narrow-style
  failures but cannot detect literal training-image reproduction.

The caller (runner.py) chooses which set to use and labels the report accordingly.

References:
- Carlini et al. 2023 — Extracting Training Data from Diffusion Models. https://arxiv.org/abs/2301.13188
- Somepalli et al. 2023 — Diffusion Art or Digital Forgery? Investigating Data Replication
  in Diffusion Models. https://arxiv.org/abs/2212.03860
"""
from __future__ import annotations

import numpy as np
from PIL import Image

from .dinov2_similarity import embed


def score(
    generated: list[Image.Image],
    comparison_set: list[Image.Image],
    *,
    model_name: str = "dinov2_vitb14",
) -> np.ndarray:
    """Per-image minimum cosine *distance* (= 1 − cosine similarity) to any image in comparison_set."""
    if not generated:
        return np.array([], dtype=np.float32)
    if not comparison_set:
        raise ValueError("comparison_set is empty")

    gen_emb = embed(generated, model_name=model_name)
    cmp_emb = embed(comparison_set, model_name=model_name)

    sims = gen_emb @ cmp_emb.T
    max_sim = sims.max(axis=-1)
    return (1.0 - max_sim).astype(np.float32)
