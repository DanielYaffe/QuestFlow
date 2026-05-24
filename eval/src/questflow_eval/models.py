"""Pydantic schema + loader for config/models.json."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class Checkpoint(BaseModel):
    id: str
    name: str
    file: str
    notes: str = ""


class AlwaysOnLora(BaseModel):
    id: str
    file: str
    strength: float
    strength_clip: float
    notes: str = ""


class LoraUnderTest(BaseModel):
    id: str
    name: str = ""
    file: str
    trigger_words: str = ""
    prompt_prefix: str = ""
    negative_prompt: str = ""
    reference_dir: str
    notes: str = ""


class Condition(BaseModel):
    id: str
    checkpoint: str
    lora: str | None = None
    strength: float = 0.0
    strength_clip: float = 0.0
    # Optional override: replaces the LoRA's prompt_prefix for this condition.
    # Set to "pixel art" on a LoRA-off baseline to give a fair fight against a
    # pixel-art LoRA condition. None = use the LoRA's prefix (or none if lora=null).
    prompt_prefix_override: str | None = None


class Sampler(BaseModel):
    steps: int
    cfg: float
    sampler_name: str
    scheduler: str
    width: int
    height: int


class ModelsConfig(BaseModel):
    checkpoints: list[Checkpoint]
    always_on_loras: list[AlwaysOnLora] = Field(default_factory=list)
    loras_under_test: list[LoraUnderTest] = Field(default_factory=list)
    conditions: list[Condition]
    sampler: Sampler
    target_size_px: int = 64

    @model_validator(mode="after")
    def _validate_references(self) -> "ModelsConfig":
        ckpt_ids = {c.id for c in self.checkpoints}
        lora_ids = {l.id for l in self.loras_under_test}

        all_ids = (
            [c.id for c in self.checkpoints]
            + [l.id for l in self.always_on_loras]
            + [l.id for l in self.loras_under_test]
            + [c.id for c in self.conditions]
        )
        seen: set[str] = set()
        for x in all_ids:
            if x in seen:
                raise ValueError(f"duplicate id '{x}' — ids must be globally unique")
            seen.add(x)

        for cond in self.conditions:
            if cond.checkpoint not in ckpt_ids:
                raise ValueError(
                    f"condition '{cond.id}' references unknown checkpoint '{cond.checkpoint}'"
                )
            if cond.lora is not None and cond.lora not in lora_ids:
                raise ValueError(
                    f"condition '{cond.id}' references unknown LoRA '{cond.lora}'"
                )
            if cond.lora is None and (cond.strength != 0 or cond.strength_clip != 0):
                raise ValueError(
                    f"condition '{cond.id}' has lora=null but non-zero strength — use 0.0"
                )

        return self

    def checkpoint_by_id(self, cid: str) -> Checkpoint:
        for c in self.checkpoints:
            if c.id == cid:
                return c
        raise KeyError(cid)

    def lora_by_id(self, lid: str) -> LoraUnderTest:
        for l in self.loras_under_test:
            if l.id == lid:
                return l
        raise KeyError(lid)


def load_models_config(path: str | Path) -> ModelsConfig:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    data.pop("_comment", None)
    return ModelsConfig.model_validate(data)
