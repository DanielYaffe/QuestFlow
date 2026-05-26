"""Prompt-set loader."""
from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import BaseModel


class Prompt(BaseModel):
    id: str
    text: str
    category: str
    expected_keywords: list[str] = []


class PromptSet(BaseModel):
    prompts: list[Prompt]


def load_prompt_set(path: str | Path) -> PromptSet:
    data = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    return PromptSet.model_validate(data)
