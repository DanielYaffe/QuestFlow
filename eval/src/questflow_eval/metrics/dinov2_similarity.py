"""DINOv2 style fidelity — cosine similarity of generated images to reference centroid.

References:
- Oquab et al. 2023 — DINOv2: Learning Robust Visual Features without Supervision.
- Subject/style fidelity method adapted from Ruiz et al. 2023 (DreamBooth) and
  Sohn et al. 2023 (StyleDrop).
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
