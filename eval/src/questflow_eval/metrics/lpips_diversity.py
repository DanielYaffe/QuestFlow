"""LPIPS-based diversity within a (condition, prompt) group.

Reference: Zhang, Isola, Efros, Shechtman, Wang 2018 — The Unreasonable Effectiveness of
Deep Features as a Perceptual Metric. https://arxiv.org/abs/1801.03924
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np
import torch
from PIL import Image
from torchvision import transforms


@lru_cache(maxsize=1)
def _load_lpips(net: str = "alex", device: str | None = None):
    import lpips as lpips_lib

    device = device or ("cuda" if torch.cuda.is_available() else "cpu")
    model = lpips_lib.LPIPS(net=net, verbose=False)
    model.to(device).eval()

    preprocess = transforms.Compose(
        [
            transforms.Resize(256, interpolation=transforms.InterpolationMode.BICUBIC),
            transforms.CenterCrop(256),
            transforms.ToTensor(),
            transforms.Normalize(mean=(0.5, 0.5, 0.5), std=(0.5, 0.5, 0.5)),
        ]
    )
    return model, preprocess, device


@torch.no_grad()
def score_pairwise(images: list[Image.Image], *, net: str = "alex") -> float:
    """Mean pairwise LPIPS distance across images. Returns NaN if <2 images."""
    if len(images) < 2:
        return float("nan")
    model, preprocess, device = _load_lpips(net)
    batch = torch.stack([preprocess(im.convert("RGB")) for im in images]).to(device)

    distances: list[float] = []
    n = batch.shape[0]
    for i in range(n):
        if i + 1 >= n:
            break
        a = batch[i : i + 1].expand(n - i - 1, -1, -1, -1)
        b = batch[i + 1 :]
        d = model(a, b).view(-1).cpu().numpy()
        distances.extend(d.tolist())

    return float(np.mean(distances))
