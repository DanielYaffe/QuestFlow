# QuestFlow LoRA Evaluation Harness

Standalone Python harness that evaluates LoRA models against ComfyUI generations using CLIP, DINOv2, FID, LPIPS, and raw-image pixel-art-style metrics.

- **[lora-testing.md](lora-testing.md)** — design + methodology
- **[FLOW.md](FLOW.md)** — runtime flow end-to-end
- **[USER_GUIDE.md](USER_GUIDE.md)** — how to set up, run, and add new LoRAs

## Quick start

```powershell
cd backend\eval
uv venv --python 3.11
uv sync
uv run python -m questflow_eval run
```

## What gets compared by default

The shipped `config/models.json` defines 4 conditions chosen so every comparison is meaningful (no "pixel-art LoRA vs photographic SDXL" trivial wins):

| condition | checkpoint | LoRA | positive prompt |
|---|---|---|---|
| `pa_xl__no_lora` | pixelArtDiffusionXL | — | `<subject>, solid blue background` |
| `pa_xl__cb_final_085` | pixelArtDiffusionXL | cb_final | `cbstyle, <subject>, solid blue background` |
| `sdxl__prompt_pixel` | sd_xl_base_1.0 | — | `pixel art, <subject>, solid blue background` |
| `sdxl__cb_final_085` | sd_xl_base_1.0 | cb_final | `cbstyle, <subject>, solid blue background` |

4 conditions × 10 prompts × 2 seeds = **80 images, ~3–4 min on a 4090/A5000**.

## How prompts are built

Concise on purpose. The LoRA + checkpoint do the visual work; the prompt names the subject.

- **LoRA-on:** `{trigger}, {prefix?}, {subject}, solid blue background`
- **LoRA-off:** `{subject}, solid blue background`
- **LoRA-off + override:** `{override}, {subject}, solid blue background`

The `prompt_prefix_override` on a condition lets you give a LoRA-off baseline a stylistic hint (e.g. `pixel art`) — used by `sdxl__prompt_pixel` above to make the SDXL-vs-LoRA comparison a fair fight rather than a trivial pixel-art-vs-photo win.

Trigger words are emitted **only** on LoRA-on conditions. Same minimal negative prompt is used everywhere so the only differences between conditions are the model weights and the explicit prefix.

See [USER_GUIDE.md](USER_GUIDE.md) for full setup, troubleshooting, and how to add new LoRAs or compare multiple training epochs.
