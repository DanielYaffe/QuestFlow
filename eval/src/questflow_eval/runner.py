"""End-to-end orchestrator: pre-flight, generation, metrics, report."""
from __future__ import annotations

import datetime as dt
import hashlib
import io
import json
import logging
import os
import subprocess
from collections import defaultdict
from dataclasses import asdict
from pathlib import Path

import numpy as np
from PIL import Image
from tqdm import tqdm

from .comfy_client import ComfyClient
from .eval_config import EvalConfig
from .image_prep import prep_for_metric
from .models import ModelsConfig
from .pixel_snapper import snap
from .prompt_composer import compose_prompt
from .prompt_set import PromptSet
from .stats import bootstrap_mean_ci
from .sweep import EvalCell, build_cells, condition_by_id, prompt_by_id
from .workflow_patcher import build_workflow, load_template

log = logging.getLogger(__name__)


def _git_sha(eval_dir: Path) -> str:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=eval_dir,
            capture_output=True,
            check=True,
            text=True,
        )
        return out.stdout.strip()
    except Exception:
        return "nogit"


def resolve_run_id(eval_dir: Path) -> str:
    ts = dt.datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
    return f"{ts}_{_git_sha(eval_dir)}"


def _try_set_deterministic() -> None:
    try:
        import torch
        torch.backends.cudnn.deterministic = True
        torch.backends.cudnn.benchmark = False
    except Exception:
        pass


def preflight(
    models: ModelsConfig,
    cfg: EvalConfig,
    client: ComfyClient,
) -> None:
    """Verify every checkpoint and LoRA file is known to ComfyUI."""
    info = client.object_info()

    def _names(class_name: str, input_name: str) -> set[str]:
        node = info.get(class_name) or {}
        inputs = (node.get("input") or {}).get("required") or {}
        spec = inputs.get(input_name)
        if isinstance(spec, list) and spec and isinstance(spec[0], list):
            return set(spec[0])
        return set()

    available_ckpts = _names("CheckpointLoaderSimple", "ckpt_name")
    # rgthree Power Lora Loader stores its lora list under "Power Lora Loader (rgthree)" → lora widget name varies.
    # As a robust fallback also pull from the canonical LoraLoader node.
    available_loras = _names("LoraLoader", "lora_name") | _names(
        "Power Lora Loader (rgthree)", "lora_name"
    )

    for ckpt in models.checkpoints:
        if available_ckpts and ckpt.file not in available_ckpts:
            log.warning("checkpoint '%s' not listed by ComfyUI (continuing)", ckpt.file)

    for ao in models.always_on_loras:
        if available_loras and ao.file not in available_loras:
            log.warning("always-on lora '%s' not listed by ComfyUI (continuing)", ao.file)

    for lut in models.loras_under_test:
        if available_loras and lut.file not in available_loras:
            log.warning("lora under test '%s' not listed by ComfyUI (continuing)", lut.file)


def _save_png(buf: bytes, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(buf)


def _cell_paths(run_dir: Path, cell: EvalCell) -> tuple[Path, Path]:
    raw = run_dir / "raw" / cell.condition_id / f"{cell.prompt_id}_{cell.seed_index}.png"
    snapped = run_dir / "snapped" / cell.condition_id / f"{cell.prompt_id}_{cell.seed_index}.png"
    return raw, snapped


def generate(
    cells: list[EvalCell],
    models: ModelsConfig,
    prompts: PromptSet,
    cfg: EvalConfig,
    eval_dir: Path,
    run_dir: Path,
    *,
    resume: bool = False,
) -> None:
    client = ComfyClient(cfg.comfy_endpoint, cfg.comfy_poll_interval_s, cfg.comfy_timeout_s)
    preflight(models, cfg, client)

    template = load_template(eval_dir)
    workflows_dir = run_dir / "workflows"
    workflows_dir.mkdir(parents=True, exist_ok=True)

    seen_conditions: set[str] = set()

    for cell in tqdm(cells, desc="generating", unit="img"):
        raw_path, snapped_path = _cell_paths(run_dir, cell)
        if resume and raw_path.exists() and snapped_path.exists():
            continue

        cond = condition_by_id(models, cell.condition_id)
        prompt = prompt_by_id(prompts, cell.prompt_id)
        lora_meta = models.lora_by_id(cond.lora) if cond.lora else None
        positive, negative = compose_prompt(
            lora_meta,
            prompt.text,
            prompt_prefix_override=cond.prompt_prefix_override,
        )

        workflow = build_workflow(
            template,
            condition=cond,
            models=models,
            sampler=models.sampler,
            positive=positive,
            negative=negative,
            seed=cell.seed,
        )

        if cell.condition_id not in seen_conditions:
            (workflows_dir / f"{cell.condition_id}.json").write_text(
                json.dumps(workflow, indent=2), encoding="utf-8"
            )
            seen_conditions.add(cell.condition_id)

        prompt_id = client.submit_prompt(workflow)
        img_ref = client.wait_for_history(prompt_id)
        img_bytes = client.fetch_image(img_ref)

        _save_png(img_bytes, raw_path)

        raw_img = Image.open(io.BytesIO(img_bytes))
        snapped_img = snap(raw_img, models.target_size_px)
        snapped_path.parent.mkdir(parents=True, exist_ok=True)
        snapped_img.save(snapped_path)


def _sha256(path: Path) -> str:
    try:
        h = hashlib.sha256()
        with path.open("rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
        return h.hexdigest()
    except Exception:
        return ""


def _load_image(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def compute_metrics(
    cells: list[EvalCell],
    models: ModelsConfig,
    prompts: PromptSet,
    cfg: EvalConfig,
    eval_dir: Path,
    run_dir: Path,
) -> tuple[dict, list[dict], dict]:
    """Returns (metrics_json, csv_rows, cells_index)."""
    from .metrics import clipscore as m_clip
    from .metrics import dinov2_similarity as m_dino
    from .metrics import fid as m_fid
    from .metrics import lpips_diversity as m_lpips
    from .metrics import memorization as m_mem
    from .metrics import pixel_metrics as m_pixel

    rng = np.random.default_rng(cfg.rng_seed)

    cells_by_cond: dict[str, list[EvalCell]] = defaultdict(list)
    for c in cells:
        cells_by_cond[c.condition_id].append(c)

    cells_index: dict[str, list[dict]] = {
        cid: [{"prompt_id": c.prompt_id, "seed_index": c.seed_index, "seed": c.seed} for c in v]
        for cid, v in cells_by_cond.items()
    }

    csv_rows: list[dict] = []
    per_condition: dict[str, dict] = {}

    reference_cache: dict[str, list[Image.Image]] = {}
    reference_paths_cache: dict[str, list[Path]] = {}

    def _reference_for_lora(lora_id: str) -> tuple[list[Image.Image], list[Path]]:
        if lora_id in reference_cache:
            return reference_cache[lora_id], reference_paths_cache[lora_id]
        lora = models.lora_by_id(lora_id)
        ref_dir = (eval_dir / lora.reference_dir).resolve()
        if not ref_dir.exists():
            raise FileNotFoundError(f"reference dir for LoRA '{lora_id}' not found: {ref_dir}")
        ref_paths = sorted(
            p for p in ref_dir.iterdir() if p.suffix.lower() in (".png", ".jpg", ".jpeg")
        )
        if not ref_paths:
            raise FileNotFoundError(f"reference dir for LoRA '{lora_id}' is empty: {ref_dir}")
        refs = [prep_for_metric(_load_image(p), bg_color=cfg.background_color,
                                rembg_fallback=cfg.rembg_fallback) for p in ref_paths]
        reference_cache[lora_id] = refs
        reference_paths_cache[lora_id] = ref_paths
        return refs, ref_paths

    # Pick a default LoRA reference for LoRA-off conditions: first lora_under_test.
    fallback_lora_id = models.loras_under_test[0].id if models.loras_under_test else None

    for cid, cond_cells in tqdm(cells_by_cond.items(), desc="metrics", unit="cond"):
        cond = condition_by_id(models, cid)
        lora_id_for_ref = cond.lora or fallback_lora_id
        if lora_id_for_ref is None:
            raise RuntimeError(
                f"condition '{cid}' has no LoRA and no fallback LoRA available for reference"
            )
        ref_imgs, ref_paths = _reference_for_lora(lora_id_for_ref)

        raw_paths: list[Path] = []
        snapped_paths: list[Path] = []
        prompt_texts: list[str] = []
        for c in cond_cells:
            rp, sp = _cell_paths(run_dir, c)
            raw_paths.append(rp)
            snapped_paths.append(sp)
            prompt_texts.append(prompt_by_id(prompts, c.prompt_id).text)

        prepped_gen = [
            prep_for_metric(_load_image(rp), bg_color=cfg.background_color,
                            rembg_fallback=cfg.rembg_fallback)
            for rp in raw_paths
        ]

        clip_vals = m_clip.score(prepped_gen, prompt_texts, model_name=cfg.clip_model,
                                 pretrained=cfg.clip_pretrained)
        dino_centroid, _dino_max = m_dino.score_against_reference(
            prepped_gen, ref_imgs, model_name=cfg.dinov2_model
        )
        mem_dists = m_mem.score(prepped_gen, ref_imgs, model_name=cfg.dinov2_model)
        fid_value = m_fid.score_images(raw_paths, ref_paths)

        # LPIPS diversity: per-prompt group, average across prompts.
        by_prompt: dict[str, list[Image.Image]] = defaultdict(list)
        for c, img in zip(cond_cells, prepped_gen):
            by_prompt[c.prompt_id].append(img)
        lpips_per_prompt = [m_lpips.score_pairwise(imgs, net=cfg.lpips_net)
                            for imgs in by_prompt.values()]
        lpips_arr = np.array([v for v in lpips_per_prompt if np.isfinite(v)], dtype=np.float32)

        # Pixel-art metrics: run on the RAW 1024×1024 image, NOT the snapped 64×64.
        # Snapping forces every condition to look pixel-art-shaped, so it can't
        # discriminate between conditions. We want to know whether the model *already
        # produced* something pixel-art-like at native resolution.
        pix_palette: list[float] = []
        pix_hard: list[float] = []
        pix_block: list[float] = []
        pixel_art_per_image: list[float] = []
        for rp in raw_paths:
            img = Image.open(rp).convert("RGB")
            r = m_pixel.score(img)
            pix_palette.append(r["palette_size"])
            pix_hard.append(r["edge_hardness"])
            pix_block.append(r["block_uniformity"])
            pixel_art_per_image.append(r["pixel_art"])

        per_metric = {
            "clipscore": clip_vals,
            "dinov2_fidelity": dino_centroid,
            "lpips_diversity": lpips_arr,
            "memorization": mem_dists,
            "pixel_art": np.array(pixel_art_per_image, dtype=np.float32),
        }

        per_condition[cid] = {"metrics": {}}
        for metric_name, vals in per_metric.items():
            mean, lo, hi = bootstrap_mean_ci(
                vals, n=cfg.bootstrap_n, ci=cfg.bootstrap_ci, rng=rng
            )
            per_condition[cid]["metrics"][metric_name] = {
                "mean": mean, "ci_low": lo, "ci_high": hi,
                "n": int(np.asarray(vals).size),
            }
        per_condition[cid]["metrics"]["fid"] = {
            "mean": fid_value, "ci_low": fid_value, "ci_high": fid_value,
            "n": len(raw_paths),
        }

        for c, clip_v, dino_v, mem_v, hard, block, pa, pa_score in zip(
            cond_cells, clip_vals, dino_centroid, mem_dists, pix_hard, pix_block, pix_palette, pixel_art_per_image
        ):
            csv_rows.append({
                "condition_id": c.condition_id,
                "prompt_id": c.prompt_id,
                "seed_index": c.seed_index,
                "seed": c.seed,
                "clipscore": float(clip_v),
                "dinov2_fidelity": float(dino_v),
                "memorization": float(mem_v),
                "edge_hardness": float(hard),
                "block_uniformity": float(block),
                "palette_size": float(pa),
                "pixel_art": float(pa_score),
            })

    sha_map = {}
    comfy_models_dir = os.environ.get("COMFYUI_MODELS_DIR")
    if comfy_models_dir:
        base = Path(comfy_models_dir)
        for ckpt in models.checkpoints:
            sha_map[ckpt.file] = _sha256(base / "checkpoints" / ckpt.file)
        for ao in models.always_on_loras:
            sha_map[ao.file] = _sha256(base / "loras" / ao.file)
        for lut in models.loras_under_test:
            sha_map[lut.file] = _sha256(base / "loras" / lut.file)

    metrics_json = {
        "run_id": run_dir.name,
        "config": {
            "rng_seed": cfg.rng_seed,
            "seeds_per_prompt": cfg.seeds_per_prompt,
            "bootstrap_n": cfg.bootstrap_n,
            "bootstrap_ci": cfg.bootstrap_ci,
            "comfy_endpoint": cfg.comfy_endpoint,
            "clip_model": cfg.clip_model,
            "dinov2_model": cfg.dinov2_model,
            "lpips_net": cfg.lpips_net,
        },
        "models": {
            "checkpoints": [asdict(c) if hasattr(c, "__dataclass_fields__") else c.model_dump()
                            for c in models.checkpoints],
            "always_on_loras": [c.model_dump() for c in models.always_on_loras],
            "loras_under_test": [c.model_dump() for c in models.loras_under_test],
            "conditions": [c.model_dump() for c in models.conditions],
            "sampler": models.sampler.model_dump(),
            "target_size_px": models.target_size_px,
        },
        "file_sha256": sha_map,
        "per_condition": per_condition,
    }

    return metrics_json, csv_rows, cells_index


def run(
    *,
    eval_dir: Path,
    models: ModelsConfig,
    prompts: PromptSet,
    cfg: EvalConfig,
    run_id: str | None = None,
    resume: bool = False,
) -> Path:
    _try_set_deterministic()
    run_id = run_id or resolve_run_id(eval_dir)
    run_dir = eval_dir / cfg.results_dir / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    cells = build_cells(models, prompts, cfg.seeds_per_prompt)
    generate(cells, models, prompts, cfg, eval_dir, run_dir, resume=resume)

    from .report import render_report, write_metrics_outputs
    metrics_json, csv_rows, cells_index = compute_metrics(
        cells, models, prompts, cfg, eval_dir, run_dir
    )
    write_metrics_outputs(run_dir, metrics_json, csv_rows)
    render_report(run_dir, metrics_json, cfg, cells_index, models.target_size_px)
    return run_dir
