"""Memorization NN — minimum DINOv2 cosine distance from each generated image to the reference set.

References:
- Carlini et al. 2023 — Extracting Training Data from Diffusion Models. https://arxiv.org/abs/2301.13188
- Somepalli et al. 2023 — Diffusion Art or Digital Forgery? Investigating Data Replication
  in Diffusion Models. https://arxiv.org/abs/2212.03860

Caveat: ideally the comparison is against the *training* set; we use the reference set as a proxy
when the training set is unavailable. This measures resemblance to reference rather than true
memorization. See lora-testing.md §10.
"""
from __future__ import annotations

import numpy as np
from PIL import Image

from .dinov2_similarity import embed


def score(
    generated: list[Image.Image],
    reference: list[Image.Image],
    *,
    model_name: str = "dinov2_vitb14",
) -> np.ndarray:
    """Per-image minimum cosine *distance* (= 1 − cosine similarity) to any reference image."""
    if not generated:
        return np.array([], dtype=np.float32)
    if not reference:
        raise ValueError("reference set is empty")

    gen_emb = embed(generated, model_name=model_name)
    ref_emb = embed(reference, model_name=model_name)

    sims = gen_emb @ ref_emb.T
    max_sim = sims.max(axis=-1)
    return (1.0 - max_sim).astype(np.float32)
