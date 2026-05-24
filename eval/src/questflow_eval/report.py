"""Generate report.md + plots + comparison grids from metrics.json."""
from __future__ import annotations

import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import seaborn as sns  # noqa: E402
from PIL import Image  # noqa: E402

from .aggregate import aggregate, normalise, rank
from .eval_config import EvalConfig, WeightSet


CAVEATS_MD = """\
## Caveats and threats to validity

1. **Small-n FID is unreliable.** Chong & Forsyth 2020 show FID is biased downward at small samples. With ~20 images/condition FID is indicative, not authoritative.
2. **CLIPScore is out-of-distribution for pixel art.** ViT-L/14 was trained on natural images. Absolute values aren't comparable to COCO-reported numbers; use only for relative ranking across conditions in this sweep.
3. **DINOv2 also wasn't trained on sprites**, but generalises better to non-photographic content than CLIP. Still a transfer-learning limitation.
4. **Diversity ≠ quality.** Interpret LPIPS only alongside CLIPScore and DINOv2.
5. **Reference set is finite and user-provided.** Style fidelity is biased toward whatever those sprites depict.
6. **Memorization NN uses the reference set as a proxy.** Training set unavailable, so this measures resemblance to reference rather than true memorization.
7. **No training-loss curves.** Inference-time metrics are the only window into LoRA quality.
8. **Weight choice is subjective.** Sensitivity analysis included below.
9. **DMD2 is constant across all conditions.** "LoRA off" measures DMD2 + checkpoint, not vanilla checkpoint — the right comparison because production also uses DMD2.
10. **Pixel-art-specific metrics are heuristic.** Palette / edge-hardness / block-uniformity are proxies, not gold standards. They are computed on the **raw 1024×1024 generation** (not the snapped 64×64), because the production pixel snapper would force every condition into the pixel-art bucket and defeat per-condition comparison. They measure whether a model *natively* produces pixel-art-shaped output.
11. **Single-run variance.** Bootstrap CIs capture sampling variance within a run; they don't capture run-to-run fp16 nondeterminism. cuDNN deterministic mode is on to minimise this.
"""


def _format_ci(mean: float, lo: float, hi: float, fmt: str = ".3f") -> str:
    if not np.isfinite(mean):
        return "—"
    return f"{mean:{fmt}} [{lo:{fmt}}, {hi:{fmt}}]"


def _condition_means(metrics_json: dict) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    for cid, c in metrics_json["per_condition"].items():
        for metric, agg in c["metrics"].items():
            out.setdefault(metric, {})[cid] = agg["mean"]
    return out


def render_plots(metrics_json: dict, plots_dir: Path) -> None:
    plots_dir.mkdir(parents=True, exist_ok=True)
    sns.set_theme(style="whitegrid")

    rows = []
    for cid, c in metrics_json["per_condition"].items():
        for metric, agg in c["metrics"].items():
            rows.append({"condition": cid, "metric": metric, "mean": agg["mean"],
                         "lo": agg["ci_low"], "hi": agg["ci_high"]})
    df = pd.DataFrame(rows)
    if df.empty:
        return

    for metric in df["metric"].unique():
        sub = df[df["metric"] == metric].copy()
        sub = sub.sort_values("mean", ascending=False)
        fig, ax = plt.subplots(figsize=(7, 0.6 + 0.4 * len(sub)))
        errs = np.array([sub["mean"] - sub["lo"], sub["hi"] - sub["mean"]])
        errs = np.where(errs < 0, 0, errs)
        ax.barh(sub["condition"], sub["mean"], xerr=errs, color="#4C72B0")
        ax.set_xlabel(f"{metric} (mean ± 95% CI)")
        ax.set_title(metric)
        ax.invert_yaxis()
        fig.tight_layout()
        fig.savefig(plots_dir / f"{metric}.png", dpi=120)
        plt.close(fig)


def render_grids(
    cells_index: dict,
    snapped_root: Path,
    grids_dir: Path,
    target_size_px: int,
) -> None:
    """One PNG per prompt: rows = conditions, columns = seeds."""
    grids_dir.mkdir(parents=True, exist_ok=True)

    by_prompt: dict[str, dict[str, dict[int, Path]]] = {}
    for cid, condition_cells in cells_index.items():
        for cell in condition_cells:
            by_prompt.setdefault(cell["prompt_id"], {}).setdefault(cid, {})[cell["seed_index"]] = (
                snapped_root / cid / f"{cell['prompt_id']}_{cell['seed_index']}.png"
            )

    cell_px = max(target_size_px * 4, 128)
    for pid, by_cond in by_prompt.items():
        conds = sorted(by_cond.keys())
        seed_indices = sorted({s for cs in by_cond.values() for s in cs.keys()})
        if not conds or not seed_indices:
            continue
        n_rows = len(conds)
        n_cols = len(seed_indices)
        header = 24
        label_w = 200
        grid = Image.new("RGB", (label_w + n_cols * cell_px, header + n_rows * cell_px), "white")
        from PIL import ImageDraw, ImageFont
        draw = ImageDraw.Draw(grid)
        try:
            font = ImageFont.truetype("arial.ttf", 14)
        except OSError:
            font = ImageFont.load_default()
        draw.text((8, 4), f"prompt: {pid}", fill="black", font=font)

        for r, cid in enumerate(conds):
            draw.text((4, header + r * cell_px + cell_px // 2 - 7), cid, fill="black", font=font)
            for c, s in enumerate(seed_indices):
                path = by_cond.get(cid, {}).get(s)
                if path and path.exists():
                    img = Image.open(path).convert("RGB").resize((cell_px, cell_px), Image.Resampling.NEAREST)
                    grid.paste(img, (label_w + c * cell_px, header + r * cell_px))
        grid.save(grids_dir / f"prompt_{pid}_comparison.png")


def render_report(
    run_dir: Path,
    metrics_json: dict,
    cfg: EvalConfig,
    cells_index: dict,
    target_size_px: int,
) -> Path:
    plots_dir = run_dir / "plots"
    grids_dir = run_dir / "grids"
    render_plots(metrics_json, plots_dir)
    render_grids(cells_index, run_dir / "snapped", grids_dir, target_size_px)

    condition_means = _condition_means(metrics_json)
    normalised = normalise(condition_means)

    default_scores = aggregate(normalised, cfg.weights.default)
    style_scores = aggregate(normalised, cfg.weights.style_heavy)
    prompt_scores = aggregate(normalised, cfg.weights.prompt_heavy)

    default_rank = rank(default_scores).set_index("condition_id")
    style_rank = rank(style_scores).set_index("condition_id")
    prompt_rank = rank(prompt_scores).set_index("condition_id")

    lines: list[str] = []
    lines.append(f"# Evaluation report — run `{run_dir.name}`\n")
    lines.append(f"- ComfyUI endpoint: `{cfg.comfy_endpoint}`\n")
    lines.append(f"- RNG seed: `{cfg.rng_seed}`, seeds per prompt: `{cfg.seeds_per_prompt}`\n")
    lines.append(f"- Bootstrap n: `{cfg.bootstrap_n}`, CI: `{cfg.bootstrap_ci:.0%}`\n\n")

    lines.append("## Per-metric scores (mean ± 95% CI)\n")
    cond_ids = list(metrics_json["per_condition"].keys())
    metrics_order = sorted({m for c in metrics_json["per_condition"].values() for m in c["metrics"]})
    header = ["condition", *metrics_order]
    lines.append("| " + " | ".join(header) + " |")
    lines.append("|" + "|".join(["---"] * len(header)) + "|")
    for cid in cond_ids:
        row = [cid]
        for m in metrics_order:
            agg = metrics_json["per_condition"][cid]["metrics"].get(m, {})
            row.append(_format_ci(agg.get("mean", float("nan")), agg.get("ci_low", float("nan")), agg.get("ci_high", float("nan"))))
        lines.append("| " + " | ".join(row) + " |")
    lines.append("")

    lines.append("## Aggregate ranking (default weights)\n")
    lines.append("| rank | condition | aggregate score |")
    lines.append("|---|---|---|")
    for cid, row in default_rank.iterrows():
        lines.append(f"| {int(row['rank'])} | {cid} | {row['score']:.3f} |")
    lines.append("")

    lines.append("## Sensitivity — alternative weight regimes\n")
    lines.append("| condition | default rank | style-heavy rank | prompt-heavy rank |")
    lines.append("|---|---|---|---|")
    for cid in cond_ids:
        lines.append(
            f"| {cid} | {int(default_rank.loc[cid, 'rank'])} | "
            f"{int(style_rank.loc[cid, 'rank'])} | {int(prompt_rank.loc[cid, 'rank'])} |"
        )
    lines.append("")

    lines.append("## Plots\n")
    for p in sorted(plots_dir.glob("*.png")):
        lines.append(f"![{p.stem}](plots/{p.name})\n")
    lines.append("")

    lines.append("## Comparison grids (per prompt: rows=conditions, cols=seeds)\n")
    for p in sorted(grids_dir.glob("*.png")):
        lines.append(f"![{p.stem}](grids/{p.name})\n")
    lines.append("")

    lines.append(CAVEATS_MD)

    out_path = run_dir / "report.md"
    out_path.write_text("\n".join(lines), encoding="utf-8")
    return out_path


def write_metrics_outputs(run_dir: Path, metrics_json: dict, csv_rows: list[dict]) -> None:
    (run_dir / "metrics.json").write_text(json.dumps(metrics_json, indent=2), encoding="utf-8")
    pd.DataFrame(csv_rows).to_csv(run_dir / "metrics.csv", index=False)
