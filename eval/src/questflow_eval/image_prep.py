"""Background-normalisation pipeline (Option B from FLOW.md).

Both reference sprites and generated images go through `prep_for_metric()` before
CLIP / DINOv2 / FID compute embeddings, so background colour doesn't leak into
style-fidelity scores.
"""
from __future__ import annotations

import io
import logging

from PIL import Image

log = logging.getLogger(__name__)


_rembg_session = None


def _get_rembg_session():
    global _rembg_session
    if _rembg_session is None:
        from rembg import new_session  # imported lazily; heavy dep
        _rembg_session = new_session("u2net")
    return _rembg_session


def _has_alpha(img: Image.Image) -> bool:
    return img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)


def _alpha_is_meaningful(img: Image.Image) -> bool:
    """True if the image has a transparent area (i.e., alpha mask is not entirely opaque)."""
    if not _has_alpha(img):
        return False
    rgba = img.convert("RGBA")
    alpha = rgba.split()[-1]
    return alpha.getextrema()[0] < 250


def _composite_on_bg(img: Image.Image, bg_color: tuple[int, int, int]) -> Image.Image:
    rgba = img.convert("RGBA")
    bg = Image.new("RGB", rgba.size, bg_color)
    bg.paste(rgba, mask=rgba.split()[-1])
    return bg


def _remove_bg(img: Image.Image) -> Image.Image:
    """Run rembg to produce an RGBA image with the subject foregrounded."""
    from rembg import remove  # lazy

    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="PNG")
    cut = remove(buf.getvalue(), session=_get_rembg_session())
    return Image.open(io.BytesIO(cut)).convert("RGBA")


def prep_for_metric(
    img: Image.Image,
    *,
    bg_color: tuple[int, int, int] = (255, 255, 255),
    rembg_fallback: bool = True,
) -> Image.Image:
    """Normalise an image so backgrounds don't leak into metric scores.

    - If the image already has a meaningful alpha channel, composite onto bg_color.
    - Otherwise (solid background still present), optionally run rembg, then composite.
    - Returns RGB image at the original spatial resolution.
    """
    if _alpha_is_meaningful(img):
        return _composite_on_bg(img, bg_color)

    if rembg_fallback:
        try:
            cut = _remove_bg(img)
            return _composite_on_bg(cut, bg_color)
        except Exception as e:  # rembg can crash on weird inputs
            log.warning("rembg failed (%s); using image as-is on bg", e)

    return img.convert("RGB")
