"""Builds the deterministic ordered list of evaluation cells from models.json + prompt set."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass

from .models import Condition, ModelsConfig
from .prompt_set import Prompt, PromptSet


@dataclass(frozen=True)
class EvalCell:
    condition_id: str
    prompt_id: str
    seed_index: int
    seed: int


def _derive_seed(prompt_id: str, seed_index: int) -> int:
    """Same seed across all conditions for a given (prompt, seed_index) — common-random-numbers."""
    h = hashlib.sha256(f"{prompt_id}|{seed_index}".encode("utf-8")).digest()
    return int.from_bytes(h[:4], "big")


def build_cells(
    models: ModelsConfig,
    prompts: PromptSet,
    seeds_per_prompt: int,
) -> list[EvalCell]:
    cells: list[EvalCell] = []
    for cond in models.conditions:
        for prompt in prompts.prompts:
            for s in range(seeds_per_prompt):
                cells.append(
                    EvalCell(
                        condition_id=cond.id,
                        prompt_id=prompt.id,
                        seed_index=s,
                        seed=_derive_seed(prompt.id, s),
                    )
                )
    return cells


def condition_by_id(models: ModelsConfig, condition_id: str) -> Condition:
    for c in models.conditions:
        if c.id == condition_id:
            return c
    raise KeyError(condition_id)


def prompt_by_id(prompts: PromptSet, pid: str) -> Prompt:
    for p in prompts.prompts:
        if p.id == pid:
            return p
    raise KeyError(pid)
