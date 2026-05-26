"""Compose positive/negative prompts — concise variant with optional prompt-matched baseline.

Principle: let the LoRA + checkpoint do the visual work; let the prompt name the subject.

Default behaviour:
  LoRA-on  → "{trigger_words}, {prompt_prefix?}, {user_subject}, solid blue background"
  LoRA-off → "{user_subject}, solid blue background"

When a condition sets `prompt_prefix_override`, the override replaces whatever prefix
the LoRA would have contributed — and is applied even when lora=None. That gives a
"prompt-matched" baseline: tell the bare checkpoint to also produce pixel art, so the
DINOv2 comparison isn't trivially won by "pixel art vs photo".

The trigger word is only emitted when a LoRA is active (it's a no-op token otherwise).
"""
from __future__ import annotations

import re

from .models import LoraUnderTest

BACKGROUND_PHRASE = ", solid blue background"
DEFAULT_NEGATIVE = "blurry, low quality, text, watermark, signature, jpeg artifacts"


def compose_prompt(
    lora: LoraUnderTest | None,
    user_subject: str,
    *,
    prompt_prefix_override: str | None = None,
    extra_negative: str | None = None,
) -> tuple[str, str]:
    parts: list[str] = []

    if lora is not None:
        triggers = lora.trigger_words.strip().rstrip(",")
        if triggers:
            parts.append(triggers)

    if prompt_prefix_override is not None:
        prefix = prompt_prefix_override.strip().rstrip(",")
        if prefix:
            parts.append(prefix)
    elif lora is not None:
        prefix = lora.prompt_prefix.strip().rstrip(",")
        if prefix:
            parts.append(prefix)

    parts.append(user_subject.strip().rstrip(","))

    positive = ", ".join(p for p in parts if p)
    positive = re.sub(r"\s+", " ", positive) + BACKGROUND_PHRASE

    if lora is not None and lora.negative_prompt:
        negative = lora.negative_prompt
    else:
        negative = DEFAULT_NEGATIVE
    if extra_negative:
        negative = f"{negative}, {extra_negative}"

    return positive, negative
