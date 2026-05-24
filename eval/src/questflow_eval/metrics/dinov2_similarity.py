"""DINOv2 style fidelity — cosine similarity of generated images to a reference centroid.

What this measures: embed every reference sprite into DINOv2 ViT-B/14 feature space,
average them into a "reference centroid", then score each generated image by its
cosine similarity to that centroid. Higher = the output looks more like the reference
distribution.

Why this is the load-bearing metric: the whole point of training a style LoRA is to
make a model produce a specific look on demand. DINOv2 fidelity is the most direct
quantitative measurement of "did the LoRA learn the style". Without it you'd only
have visual inspection.

Why DINOv2 specifically (not CLIP) for style: CLIP's embeddings are entangled with
text concepts — two CB sprites would land near each other in CLIP space partly
because both are "creatures", a text-shaped concept. DINOv2 is image-only and self-
supervised, so its embeddings capture visual structure (shape, texture, palette,
line weight) without that bias. Standard in style-transfer literature (DreamBooth's
DINO-I score, StyleDrop).

Also used for the memorization metric: the same embeddings power the NN-distance
check in metrics/memorization.py — different question (closest reference vs centroid)
but the same model produces the embeddings, loaded once.

Limitation: DINOv2 wasn't trained on sprites specifically. Generalisation to pixel-
art domains is empirically good but not guaranteed.

References:
- Oquab et al. 2023 — DINOv2: Learning Robust Visual Features without Supervision.
  https://arxiv.org/abs/2304.07193
- Ruiz et al. 2023 — DreamBooth (DINO-I subject-fidelity score). https://arxiv.org/abs/2208.12242
- Sohn et al. 2023 — StyleDrop. https://arxiv.org/abs/2306.00983
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from torchvision import transforms


@lru_cache(maxsize=1)
def _load_dinov2(model_name: str = "dinov2_vitb14", device: str | None = None):
    device = device or ("cuda" if torch.cuda.is_available() else "cpu")
    model = torch.hub.load("facebookresearch/dinov2", model_name, trust_repo=True)
    model.to(device).eval()

    preprocess = transforms.Compose(
        [
            transforms.Resize(256, interpolation=transforms.InterpolationMode.BICUBIC),
            transforms.CenterCrop(224),
            transforms.ToTensor(),
            transforms.Normalize(mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225)),
        ]
    )
    return model, preprocess, device


@torch.no_grad()
def embed(images: list[Image.Image], *, model_name: str = "dinov2_vitb14") -> np.ndarray:
    if not images:
        return np.zeros((0, 768), dtype=np.float32)
    model, preprocess, device = _load_dinov2(model_name)
    batch = torch.stack([preprocess(im.convert("RGB")) for im in images]).to(device)
    feats = model(batch)
    feats = feats / feats.norm(dim=-1, keepdim=True)
    return feats.cpu().numpy().astype(np.float32)


def _load_ref_images(ref_dir: Path) -> list[Image.Image]:
    if not ref_dir.exists():
        raise FileNotFoundError(f"reference dir not found: {ref_dir}")
    paths = sorted(p for p in ref_dir.iterdir() if p.suffix.lower() in (".png", ".jpg", ".jpeg"))
    return [Image.open(p) for p in paths]


def score_against_reference(
    generated: list[Image.Image],
    reference: list[Image.Image],
    *,
    model_name: str = "dinov2_vitb14",
) -> tuple[np.ndarray, np.ndarray]:
    """Returns (cos_to_centroid_per_image, max_pair_cos_per_image)."""
    if not generated:
        return np.array([], dtype=np.float32), np.array([], dtype=np.float32)
    if not reference:
        raise ValueError("reference set is empty")

    gen_emb = embed(generated, model_name=model_name)
    ref_emb = embed(reference, model_name=model_name)

    centroid = ref_emb.mean(axis=0, keepdims=True)
    centroid = centroid / (np.linalg.norm(centroid) + 1e-12)

    cos_centroid = (gen_emb @ centroid.T).squeeze(-1)
    pair_cos = gen_emb @ ref_emb.T
    max_pair = pair_cos.max(axis=-1)

    return cos_centroid.astype(np.float32), max_pair.astype(np.float32)
