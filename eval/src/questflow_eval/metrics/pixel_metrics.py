"""Pixel-art-style metrics on the RAW 1024×1024 generation.

These score whether the model *already produced* something that looks like pixel art —
NOT whether the post-hoc pixel snapper can make any image look pixelated. (Running these
on the snapped 64×64 would force every condition into the pixel-art bucket regardless of
the underlying generation, which defeats the comparison.)

Three signals, each unit-scaled into [0,1] where 1 = more pixel-art-like:

- effective_palette: how many *occupied* bins after coarse 5-bit-per-channel quantisation.
  Pixel art uses 8–64 colours; photographic SDXL uses many thousands. We compute
  log-scaled and map to a wide pixel-art-friendly range.

- edge_hardness: fraction of edge pixels whose Sobel magnitude is in the MID range.
  Pixel art has step edges → mostly 0 or saturated, few mid. Photographic has ramp edges
  → many mid. We invert so 1 = hard edges.

- block_uniformity: how close a bicubic downsample is to a nearest-neighbour downsample
  of the same image. Pixel art's underlying blocks make the two agree closely;
  photographic content's high-frequency detail makes them diverge.

These are heuristic proxies (see caveats in lora-testing.md §10).
"""
from __future__ import annotations

import numpy as np
from PIL import Image
from scipy import ndimage


def _to_array_rgb(img: Image.Image) -> np.ndarray:
    return np.asarray(img.convert("RGB"), dtype=np.uint8)


def effective_palette_size(img: Image.Image) -> int:
    """Count occupied bins after coarse 5-bit-per-channel quantisation (32^3 bins).

    This counts visually-distinct colours, ignoring imperceptible noise. A photo with
    smooth gradients still fills many bins; a pixel-art sprite fills very few.
    """
    arr = _to_array_rgb(img) >> 3  # 8-bit → 5-bit (0..31)
    keys = arr[..., 0].astype(np.int64) * (32 * 32) + arr[..., 1] * 32 + arr[..., 2]
    return int(np.unique(keys).size)


def edge_hardness(img: Image.Image) -> float:
    """0..1. Higher = harder edges (pixel-art-like). Lower = soft gradients (photographic).

    Sobel magnitudes are split into 3 bins: weak (0..0.1), mid (0.1..0.3), strong (0.3..1).
    Pixel art has very few mid-range edges. Score = 1 − (mid / (mid + strong)).
    """
    gray = np.asarray(img.convert("L"), dtype=np.float32) / 255.0
    sx = ndimage.sobel(gray, axis=0)
    sy = ndimage.sobel(gray, axis=1)
    mag = np.hypot(sx, sy)
    edges = mag > 0.05  # ignore noise floor
    if edges.sum() < 100:
        return 0.0
    mid = ((mag >= 0.1) & (mag < 0.3) & edges).sum()
    strong = ((mag >= 0.3) & edges).sum()
    denom = mid + strong
    if denom == 0:
        return 0.0
    return float(1.0 - (mid / denom))


def block_uniformity(img: Image.Image, sample_size: int = 64) -> float:
    """0..1. Higher = image is built from large uniform blocks (pixel art).

    Downsample by NEAREST (preserves blocks) vs BICUBIC (averages high frequencies).
    Pixel art makes them agree; photographic content makes them differ.
    """
    rgb = img.convert("RGB")
    near = np.asarray(rgb.resize((sample_size, sample_size), Image.Resampling.NEAREST),
                      dtype=np.float32)
    bicu = np.asarray(rgb.resize((sample_size, sample_size), Image.Resampling.BICUBIC),
                      dtype=np.float32)
    rmse = float(np.sqrt(((near - bicu) ** 2).mean()))
    # rmse=0 → identical (pixel art); rmse=40+ → photographic. Scale to [0,1].
    return float(np.clip(1.0 - (rmse / 40.0), 0.0, 1.0))


def _palette_score(palette_size: int) -> float:
    """Map raw palette count → 0..1 score. Peaks in the pixel-art range (~16..256 bins),
    drops off above 4096 (photographic territory).
    """
    if palette_size <= 0:
        return 0.0
    log_p = np.log2(palette_size)
    # log2(16) = 4, log2(256) = 8: the sweet spot.
    # log2(4096) = 12: clearly not pixel art any more.
    if log_p <= 8.0:
        # Up to 256 bins: gently rising from 0 colour types
        return float(np.clip(log_p / 8.0, 0.0, 1.0)) ** 0.5  # sqrt to be generous on small palettes
    # Above 256 bins: penalise linearly to 0 at 4096.
    return float(np.clip(1.0 - (log_p - 8.0) / 4.0, 0.0, 1.0))


def score(img: Image.Image) -> dict[str, float]:
    """Returns raw metric values plus the composite pixel_art score in [0,1]."""
    pal = effective_palette_size(img)
    hard = edge_hardness(img)
    block = block_uniformity(img)
    composite = 0.4 * _palette_score(pal) + 0.3 * hard + 0.3 * block
    return {
        "palette_size": float(pal),
        "edge_hardness": float(hard),
        "block_uniformity": float(block),
        "pixel_art": float(composite),
    }
