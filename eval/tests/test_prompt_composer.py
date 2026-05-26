"""Tests for prompt_composer.compose_prompt.

These guard the methodology: composition must produce the documented forms exactly,
because CLIPScore and the LoRA-vs-baseline comparison depend on it.
"""
from __future__ import annotations

from questflow_eval.models import LoraUnderTest
from questflow_eval.prompt_composer import (
    BACKGROUND_PHRASE,
    DEFAULT_NEGATIVE,
    compose_prompt,
)


def _lora(**overrides) -> LoraUnderTest:
    base = dict(
        id="cb_v6",
        name="CB v6",
        file="cb.safetensors",
        trigger_words="cbstyle",
        prompt_prefix="",
        negative_prompt="blurry, low quality",
        reference_dir="data/reference_sprites/cb/",
        notes="",
    )
    base.update(overrides)
    return LoraUnderTest(**base)


def test_lora_off_is_subject_plus_background():
    pos, neg = compose_prompt(None, "round fluffy slime with big eyes")
    assert pos == "round fluffy slime with big eyes" + BACKGROUND_PHRASE
    assert neg == DEFAULT_NEGATIVE


def test_lora_on_emits_trigger_before_subject():
    pos, _ = compose_prompt(_lora(), "round fluffy slime with big eyes")
    assert pos == "cbstyle, round fluffy slime with big eyes" + BACKGROUND_PHRASE


def test_lora_on_includes_prefix_when_set():
    pos, _ = compose_prompt(_lora(prompt_prefix="pixel art"), "slime")
    assert pos == "cbstyle, pixel art, slime" + BACKGROUND_PHRASE


def test_lora_on_uses_loras_negative_prompt():
    _, neg = compose_prompt(_lora(negative_prompt="my_neg"), "slime")
    assert neg == "my_neg"


def test_override_replaces_lora_prefix_when_lora_on():
    pos, _ = compose_prompt(
        _lora(prompt_prefix="should_be_ignored"),
        "slime",
        prompt_prefix_override="custom_prefix",
    )
    assert pos == "cbstyle, custom_prefix, slime" + BACKGROUND_PHRASE


def test_override_works_even_when_lora_off():
    """Prompt-matched baseline: bare checkpoint gets a stylistic prefix without a LoRA."""
    pos, _ = compose_prompt(None, "slime", prompt_prefix_override="pixel art")
    assert pos == "pixel art, slime" + BACKGROUND_PHRASE


def test_no_trigger_when_lora_off_even_with_override():
    """Triggers belong to LoRAs. An override on a LoRA-off condition must not emit a trigger."""
    pos, _ = compose_prompt(None, "slime", prompt_prefix_override="pixel art")
    assert "cbstyle" not in pos


def test_extra_negative_appends():
    _, neg = compose_prompt(_lora(), "slime", extra_negative="extra")
    assert neg.endswith(", extra")


def test_trailing_commas_in_prefix_are_normalised():
    """A trailing comma in prompt_prefix should not produce ',,' in the output."""
    pos, _ = compose_prompt(_lora(prompt_prefix="pixel art,"), "slime")
    assert ",," not in pos
    assert pos == "cbstyle, pixel art, slime" + BACKGROUND_PHRASE
