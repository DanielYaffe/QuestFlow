"""Tests for models.py Pydantic validation.

The schema enforces methodological invariants — a condition can't reference an unknown
LoRA, lora=null must come with strength=0, etc. These tests pin those down.
"""
from __future__ import annotations

import json

import pytest
from pydantic import ValidationError

from questflow_eval.models import ModelsConfig


def _base() -> dict:
    return {
        "checkpoints": [
            {"id": "pa_xl", "name": "PA XL", "file": "pa.safetensors"},
        ],
        "always_on_loras": [
            {"id": "dmd2", "file": "dmd2.safetensors", "strength": 1.0, "strength_clip": 1.0},
        ],
        "loras_under_test": [
            {
                "id": "cb_v6",
                "name": "CB v6",
                "file": "cb.safetensors",
                "trigger_words": "cbstyle",
                "prompt_prefix": "",
                "negative_prompt": "blurry",
                "reference_dir": "data/reference_sprites/cb/",
            },
        ],
        "conditions": [
            {"id": "pa__cb", "checkpoint": "pa_xl", "lora": "cb_v6", "strength": 0.85, "strength_clip": 0.8},
        ],
        "sampler": {
            "steps": 4, "cfg": 1.2, "sampler_name": "euler", "scheduler": "simple",
            "width": 1024, "height": 1024,
        },
        "target_size_px": 64,
    }


def test_valid_config_loads():
    cfg = ModelsConfig.model_validate(_base())
    assert cfg.checkpoint_by_id("pa_xl").file == "pa.safetensors"
    assert cfg.lora_by_id("cb_v6").trigger_words == "cbstyle"


def test_condition_referencing_unknown_lora_is_rejected():
    data = _base()
    data["conditions"][0]["lora"] = "does_not_exist"
    with pytest.raises(ValidationError, match="unknown LoRA"):
        ModelsConfig.model_validate(data)


def test_condition_referencing_unknown_checkpoint_is_rejected():
    data = _base()
    data["conditions"][0]["checkpoint"] = "does_not_exist"
    with pytest.raises(ValidationError, match="unknown checkpoint"):
        ModelsConfig.model_validate(data)


def test_duplicate_id_across_namespaces_is_rejected():
    data = _base()
    data["loras_under_test"][0]["id"] = "pa_xl"  # collides with checkpoint id
    with pytest.raises(ValidationError, match="duplicate id"):
        ModelsConfig.model_validate(data)


def test_lora_null_with_non_zero_strength_is_rejected():
    data = _base()
    data["conditions"].append({
        "id": "pa__no_lora_but_strong",
        "checkpoint": "pa_xl",
        "lora": None,
        "strength": 0.5,
        "strength_clip": 0.5,
    })
    with pytest.raises(ValidationError, match="non-zero strength"):
        ModelsConfig.model_validate(data)


def test_lora_null_with_zero_strength_is_accepted():
    """The baseline condition shape — lora=null with strength=0.0 — must be valid."""
    data = _base()
    data["conditions"].append({
        "id": "pa__no_lora", "checkpoint": "pa_xl", "lora": None,
        "strength": 0.0, "strength_clip": 0.0,
    })
    ModelsConfig.model_validate(data)


def test_prompt_prefix_override_is_optional():
    data = _base()
    data["conditions"].append({
        "id": "pa__prompt_pixel", "checkpoint": "pa_xl", "lora": None,
        "strength": 0.0, "strength_clip": 0.0, "prompt_prefix_override": "pixel art",
    })
    cfg = ModelsConfig.model_validate(data)
    by_id = {c.id: c for c in cfg.conditions}
    assert by_id["pa__prompt_pixel"].prompt_prefix_override == "pixel art"
    assert by_id["pa__cb"].prompt_prefix_override is None


def test_comment_field_is_stripped_by_loader(tmp_path):
    """The _comment field in models.json should be ignored by load_models_config."""
    from questflow_eval.models import load_models_config

    data = _base()
    data["_comment"] = "this is documentation"
    p = tmp_path / "models.json"
    p.write_text(json.dumps(data), encoding="utf-8")
    cfg = load_models_config(p)
    assert len(cfg.checkpoints) == 1  # loaded successfully despite the comment
