"""Patches sdxl_power_lora.json. Mirrors the production patchWorkflow() in
../backend/src/services/generation/generationService.ts.

The workflow JSON is a local snapshot under workflow_templates/. Refresh with the
command in workflow_templates/README.md when production changes the workflow.
"""
from __future__ import annotations

import copy
import json
from pathlib import Path

from .models import AlwaysOnLora, Condition, LoraUnderTest, ModelsConfig, Sampler


WORKFLOW_TEMPLATE_RELPATH = Path("workflow_templates/sdxl_power_lora.json")


def _resolve_template_path(eval_dir: Path) -> Path:
    """Resolve the workflow template relative to the eval/ root."""
    candidate = (eval_dir / WORKFLOW_TEMPLATE_RELPATH).resolve()
    if not candidate.exists():
        raise FileNotFoundError(
            f"workflow template not found at {candidate} — refresh from production "
            f"using the command in workflow_templates/README.md"
        )
    return candidate


def load_template(eval_dir: Path) -> dict:
    return json.loads(_resolve_template_path(eval_dir).read_text(encoding="utf-8"))


def build_workflow(
    template: dict,
    *,
    condition: Condition,
    models: ModelsConfig,
    sampler: Sampler,
    positive: str,
    negative: str,
    seed: int,
) -> dict:
    w = copy.deepcopy(template)

    ckpt = models.checkpoint_by_id(condition.checkpoint)
    w["1"]["inputs"]["ckpt_name"] = ckpt.file

    # lora_1 in the template is the always-on DMD2 baked-in entry. We rebuild node 2's
    # `inputs` so any extra lora slots from a previous patch don't leak across cells.
    node2_inputs = {
        "PowerLoraLoaderHeaderWidget": {"type": "PowerLoraLoaderHeaderWidget"},
        "model": ["1", 0],
        "clip": ["1", 1],
    }

    slot = 1
    for ao in models.always_on_loras:
        node2_inputs[f"lora_{slot}"] = {
            "on": True,
            "lora": ao.file,
            "strength": ao.strength,
            "strengthTwo": ao.strength_clip,
        }
        slot += 1

    if condition.lora is not None:
        lora_meta: LoraUnderTest = models.lora_by_id(condition.lora)
        node2_inputs[f"lora_{slot}"] = {
            "on": True,
            "lora": lora_meta.file,
            "strength": condition.strength,
            "strengthTwo": condition.strength_clip,
        }
        slot += 1

    node2_inputs["➕ Add Lora"] = ""
    w["2"]["inputs"] = node2_inputs

    w["3"]["inputs"]["text"] = positive
    w["4"]["inputs"]["text"] = negative
    w["5"]["inputs"]["width"] = sampler.width
    w["5"]["inputs"]["height"] = sampler.height
    w["6"]["inputs"]["seed"] = int(seed)
    w["6"]["inputs"]["steps"] = sampler.steps
    w["6"]["inputs"]["cfg"] = sampler.cfg
    w["6"]["inputs"]["sampler_name"] = sampler.sampler_name
    w["6"]["inputs"]["scheduler"] = sampler.scheduler

    # Force a deterministic SaveImage node on the raw VAE output. The production
    # template relies on `easy imageRemBg` with image_output=Save to persist images,
    # which (a) requires the rgthree pack installed, and (b) doesn't always produce a
    # `images` field in the history's outputs dict that this client can read back.
    # We append our own SaveImage node so the eval harness has a guaranteed sink.
    w["100"] = {
        "inputs": {
            "filename_prefix": "questflow_eval",
            "images": ["7", 0],
        },
        "class_type": "SaveImage",
        "_meta": {"title": "Save Image (eval)"},
    }

    return w
