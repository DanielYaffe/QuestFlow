"""Clean-FID between a condition's generations and the held-out reference set.

What this measures: pushes every generated image and every reference image through
Inception-V3, fits a multivariate Gaussian to each set's activations (mean +
covariance), then computes the Fréchet distance between the two Gaussians. Lower =
the generated *distribution* statistically resembles the reference distribution.

How it differs from DINOv2 fidelity: DINOv2 fidelity is per-image (does THIS image
look like the centroid). FID is set-level (do the generations as a *batch* look
distributionally like the references). A LoRA that produces 20 nearly-identical
high-fidelity outputs would score high on DINOv2 (each image matches the centroid)
but poorly on FID (one mode != a distribution). So FID catches a failure DINOv2
doesn't.

Why we use Clean-FID specifically: the original FID implementation's PIL/cv2 resize
inconsistencies introduce 5-20 point biases (Parmar et al. 2022). Clean-FID standardises
the preprocessing so values are comparable across implementations.

Caveat: FID at small n is biased downward. The original paper used 50,000+ samples;
we have ~20 per condition. Numbers are indicative for relative ranking only; absolute
values aren't comparable to FID values reported in papers. Down-weighted in the
aggregate (0.15) for this reason.

References:
- Heusel et al. 2017 — GANs Trained by a Two Time-Scale Update Rule. https://arxiv.org/abs/1706.08500
- Parmar, Zhang, Zhu 2022 — On Aliased Resizing and Surprising Subtleties in GAN Evaluation.
  https://arxiv.org/abs/2104.11222
"""
from __future__ import annotations

import shutil
import tempfile
from pathlib import Path


def score_dirs(generated_dir: Path, reference_dir: Path) -> float:
    """Compute clean-FID between two directories of PNG/JPG images."""
    from cleanfid import fid

    if not generated_dir.exists() or not any(generated_dir.iterdir()):
        return float("nan")
    if not reference_dir.exists() or not any(reference_dir.iterdir()):
        return float("nan")

    return float(
        fid.compute_fid(
            str(generated_dir),
            str(reference_dir),
            mode="clean",
            num_workers=0,
            verbose=False,
        )
    )


def score_images(
    generated_paths: list[Path],
    reference_paths: list[Path],
) -> float:
    """Compute FID by staging the two sets into temp dirs (clean-fid requires dirs)."""
    if not generated_paths or not reference_paths:
        return float("nan")

    with tempfile.TemporaryDirectory(prefix="fid_gen_") as gen_tmp, tempfile.TemporaryDirectory(
        prefix="fid_ref_"
    ) as ref_tmp:
        gen_tmp_p = Path(gen_tmp)
        ref_tmp_p = Path(ref_tmp)
        for p in generated_paths:
            shutil.copy2(p, gen_tmp_p / p.name)
        for p in reference_paths:
            shutil.copy2(p, ref_tmp_p / p.name)
        return score_dirs(gen_tmp_p, ref_tmp_p)
