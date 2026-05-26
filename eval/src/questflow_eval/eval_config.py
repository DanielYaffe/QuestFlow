"""Loader for config/eval_config.yaml."""
from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import BaseModel, Field


class WeightSet(BaseModel):
    dinov2_fidelity: float
    clipscore: float
    fid: float
    pixel_art: float
    lpips_diversity: float
    memorization: float

    def as_dict(self) -> dict[str, float]:
        return self.model_dump()


class Weights(BaseModel):
    default: WeightSet
    style_heavy: WeightSet
    prompt_heavy: WeightSet


class EvalConfig(BaseModel):
    comfy_endpoint: str = "http://127.0.0.1:8188"
    comfy_poll_interval_s: float = 1.5
    comfy_timeout_s: float = 180.0

    results_dir: str = "results"

    rng_seed: int = 1337
    seeds_per_prompt: int = 2
    bootstrap_n: int = 1000
    bootstrap_ci: float = 0.95

    background_color: tuple[int, int, int] = (255, 255, 255)
    rembg_fallback: bool = True

    weights: Weights

    clip_model: str = "ViT-L-14"
    clip_pretrained: str = "openai"
    dinov2_model: str = "dinov2_vitb14"
    lpips_net: str = "alex"

    prompt_set: str = "config/prompt_set.yaml"
    prompt_set_full: str = "config/prompt_set.full.yaml"


def load_eval_config(path: str | Path) -> EvalConfig:
    data = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    if "background_color" in data and isinstance(data["background_color"], list):
        data["background_color"] = tuple(data["background_color"])
    return EvalConfig.model_validate(data)
