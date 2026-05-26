"""Tests for sweep.build_cells — pins the common-random-numbers invariant.

The headline claim of the methodology is that seeds are shared across conditions for the
same (prompt, seed_index) so model differences aren't confounded with noise. If that ever
regresses, every CI in the report becomes meaningless.
"""
from __future__ import annotations

from questflow_eval.models import ModelsConfig
from questflow_eval.prompt_set import PromptSet
from questflow_eval.sweep import build_cells, condition_by_id, prompt_by_id


def _models() -> ModelsConfig:
    return ModelsConfig.model_validate({
        "checkpoints": [{"id": "pa_xl", "name": "PA", "file": "pa.safetensors"}],
        "always_on_loras": [],
        "loras_under_test": [{
            "id": "cb", "name": "CB", "file": "cb.safetensors",
            "trigger_words": "cbstyle", "prompt_prefix": "",
            "negative_prompt": "blurry", "reference_dir": "data/reference_sprites/cb/",
        }],
        "conditions": [
            {"id": "no_lora", "checkpoint": "pa_xl", "lora": None,  "strength": 0.0,  "strength_clip": 0.0},
            {"id": "with_lora", "checkpoint": "pa_xl", "lora": "cb",  "strength": 0.85, "strength_clip": 0.8},
        ],
        "sampler": {
            "steps": 4, "cfg": 1.2, "sampler_name": "euler", "scheduler": "simple",
            "width": 1024, "height": 1024,
        },
        "target_size_px": 64,
    })


def _prompts() -> PromptSet:
    return PromptSet.model_validate({
        "prompts": [
            {"id": "p1", "text": "slime", "category": "cute"},
            {"id": "p2", "text": "dragon", "category": "cute"},
        ],
    })


def test_cell_count_is_conditions_x_prompts_x_seeds():
    cells = build_cells(_models(), _prompts(), seeds_per_prompt=3)
    assert len(cells) == 2 * 2 * 3


def test_seeds_are_shared_across_conditions_at_same_prompt_and_seed_index():
    """Common random numbers: noise is identical across conditions for the same (prompt, seed_index)."""
    cells = build_cells(_models(), _prompts(), seeds_per_prompt=2)

    by_key: dict[tuple[str, int], list[int]] = {}
    for c in cells:
        by_key.setdefault((c.prompt_id, c.seed_index), []).append(c.seed)

    for key, seeds in by_key.items():
        assert len(set(seeds)) == 1, f"seeds differ across conditions for {key}: {seeds}"


def test_seeds_differ_across_seed_indices_for_same_prompt():
    """seed_index variation must produce different noise — otherwise per-prompt diversity is fake."""
    cells = build_cells(_models(), _prompts(), seeds_per_prompt=2)
    s0 = next(c.seed for c in cells if c.prompt_id == "p1" and c.seed_index == 0)
    s1 = next(c.seed for c in cells if c.prompt_id == "p1" and c.seed_index == 1)
    assert s0 != s1


def test_seeds_differ_across_prompts_at_same_seed_index():
    """Different prompts must get different seeds at the same seed_index."""
    cells = build_cells(_models(), _prompts(), seeds_per_prompt=1)
    seeds = {c.prompt_id: c.seed for c in cells if c.condition_id == "no_lora"}
    assert seeds["p1"] != seeds["p2"]


def test_seed_derivation_is_deterministic():
    """Re-running the build with identical inputs must produce identical seeds."""
    cells_a = build_cells(_models(), _prompts(), seeds_per_prompt=2)
    cells_b = build_cells(_models(), _prompts(), seeds_per_prompt=2)
    assert [c.seed for c in cells_a] == [c.seed for c in cells_b]


def test_condition_by_id_returns_the_right_one():
    m = _models()
    assert condition_by_id(m, "with_lora").lora == "cb"


def test_prompt_by_id_returns_the_right_one():
    p = _prompts()
    assert prompt_by_id(p, "p1").text == "slime"
