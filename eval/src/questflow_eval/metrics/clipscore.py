"""CLIPScore — prompt-alignment metric.

What this measures: cosine similarity between the generated image and the text
prompt, both embedded into CLIP ViT-L/14's joint vision-language space. Scaled ×2.5
and clamped at 0 (the original paper's normalisation). Higher = the image obeys the
prompt more closely.

Why we need it: a LoRA can overfit. It might learn the style so aggressively that it
stops listening to the prompt — you ask for a "two-headed plant creature" and it
just produces a generic CB-style monster. CLIPScore catches that. In the LoRA-vs-
baseline comparison, this is the "trade-off cost" axis: how much prompt-following
was sacrificed for style fidelity.

Reference-free: CLIPScore doesn't need a held-out set. It only uses the image and
the prompt text.

Limitation: CLIP was trained on natural images and captions. Pixel art is out of
distribution, so absolute values aren't comparable to CLIPScore numbers reported on
COCO. Use only for relative ranking across conditions in this sweep.

Score formula: 2.5 · max(0, cos(CLIP_img_emb, CLIP_text_emb))

Reference: Hessel, Holtzman, Forbes, Le Bras, Choi 2021 — CLIPScore: A Reference-free
Evaluation Metric for Image Captioning. https://arxiv.org/abs/2104.08718
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np
import torch
from PIL import Image


@lru_cache(maxsize=1)
def _load_clip(model_name: str = "ViT-L-14", pretrained: str = "openai", device: str | None = None):
    import open_clip

    device = device or ("cuda" if torch.cuda.is_available() else "cpu")
    model, _, preprocess = open_clip.create_model_and_transforms(model_name, pretrained=pretrained)
    tokenizer = open_clip.get_tokenizer(model_name)
    model.to(device).eval()
    return model, preprocess, tokenizer, device


@torch.no_grad()
def score(
    images: list[Image.Image],
    texts: list[str],
    *,
    model_name: str = "ViT-L-14",
    pretrained: str = "openai",
) -> np.ndarray:
    """Returns one CLIPScore per (image, text) pair. Inputs must be aligned by index."""
    if len(images) != len(texts):
        raise ValueError("images and texts must have the same length")
    if not images:
        return np.array([], dtype=np.float32)

    model, preprocess, tokenizer, device = _load_clip(model_name, pretrained)

    img_tensors = torch.stack([preprocess(im.convert("RGB")) for im in images]).to(device)
    img_features = model.encode_image(img_tensors)
    img_features = img_features / img_features.norm(dim=-1, keepdim=True)

    tokens = tokenizer(texts).to(device)
    text_features = model.encode_text(tokens)
    text_features = text_features / text_features.norm(dim=-1, keepdim=True)

    cos = (img_features * text_features).sum(dim=-1).clamp(min=0)
    return (2.5 * cos).cpu().numpy().astype(np.float32)
