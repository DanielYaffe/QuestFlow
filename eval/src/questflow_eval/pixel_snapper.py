"""Python approximation of the Rust→WASM pixel snapper.

Used only to produce the snapped 64×64 PNGs that go into the comparison grids.
Pixel-art-style metrics (palette / edge_hardness / block_uniformity) run on the RAW
1024×1024 generation — see metrics/pixel_metrics.py — so this approximation does not
affect any numeric score.

We composite transparent pixels onto white before quantising. PIL's RGBA→RGB
conversion drops alpha by blending onto opaque black, which makes the quantiser
treat "transparent" as a real black colour and pick it as one of the n_colors —
the background then visibly re-appears as a dark fringe. Compositing onto white
first matches what image_prep.py does for the metric pipeline, so the grids and
the metrics use a consistent neutral background.
"""
from __future__ import annotations

from PIL import Image


WHITE_RGBA = (255, 255, 255, 255)


def snap(
    img: Image.Image,
    target_size_px: int,
    n_colors: int = 16,
    bg_color: tuple[int, int, int] = (255, 255, 255),
) -> Image.Image:
    """Composite onto bg_color, downsample to target_size_px, quantise to n_colors."""
    rgba = img.convert("RGBA")
    if rgba.size != (target_size_px, target_size_px):
        rgba = rgba.resize((target_size_px, target_size_px), Image.Resampling.NEAREST)

    bg = Image.new("RGBA", rgba.size, (*bg_color, 255))
    bg.paste(rgba, mask=rgba.split()[-1])
    rgb = bg.convert("RGB")

    quantised = rgb.quantize(colors=n_colors, method=Image.Quantize.MEDIANCUT)
    return quantised.convert("RGB")
