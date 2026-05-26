# User Guide — LoRA Evaluation Harness

How to set up, run, read, and extend the eval. Design rationale lives in [lora-testing.md](lora-testing.md); the runtime flow is in [FLOW.md](FLOW.md).

---

## 1. Prerequisites

- **Python 3.11** (the harness pins this; other versions don't resolve torch wheels cleanly).
- **`uv`** — fast Python package manager. Install once:

  ```powershell
  # Windows (PowerShell)
  irm https://astral.sh/uv/install.ps1 | iex
  ```

  ```bash
  # macOS / Linux
  curl -LsSf https://astral.sh/uv/install.sh | sh
  ```

- **ComfyUI running** at `http://127.0.0.1:8188` (override with `comfy_endpoint` in `config/eval_config.yaml`).
- **NVIDIA GPU** with CUDA 12.x drivers and ≥12 GB VRAM. The harness's torch is pinned to the `cu121` index in `pyproject.toml` under `[tool.uv.sources]`, so `uv sync` always gets the CUDA wheel — no manual reinstalls.
- **`git`** — `run_id` includes the QuestFlow git SHA.

---

## 2. First-time setup

```powershell
cd backend\eval
uv venv --python 3.11
uv sync
```

`uv sync` reads `pyproject.toml`, resolves against `uv.lock`, and installs into `eval/.venv/`. The CUDA-enabled torch is pinned to PyTorch's `cu121` index, so this works on a clean machine.

If you prefer plain pip:

```powershell
uv venv --python 3.11
.\.venv\Scripts\activate
pip install -r requirements.txt
pip install --index-url https://download.pytorch.org/whl/cu121 torch==2.3.1 torchvision==0.18.1
```

Verify torch sees the GPU:

```powershell
.\.venv\Scripts\python.exe -c "import torch; print(torch.__version__, torch.cuda.is_available()); print(torch.zeros(1).cuda().device)"
```

Expected output: `2.3.1+cu121 True` and `cuda:0`.

---

## 3. Drop in the model files

ComfyUI must already have these in its `models/` tree (the eval doesn't manage downloads):

- **Checkpoints** in `ComfyUI/models/checkpoints/` — every `file:` listed under `checkpoints` in `config/models.json`.
- **LoRAs** in `ComfyUI/models/loras/` — every `file:` listed under `always_on_loras` and `loras_under_test`.

The harness pre-flight queries ComfyUI's `/object_info` and warns about anything missing.

---

## 4. Drop in reference sprites

Held-out real sprites per LoRA family. Path comes from `reference_dir` in `models.json`, e.g. `data/reference_sprites/cb/`:

```
eval/data/reference_sprites/cb/
  springheel.png
  bansheep.png
  ...
```

- ~50–200 PNGs. Filenames don't matter; the harness reads contents only.
- **Held out from the LoRA training set.** Overlap inflates fidelity and breaks the memorization metric.

---

## 5. The default sweep

`config/models.json` ships with 4 conditions chosen so every comparison is meaningful:

| condition | checkpoint | LoRA | positive prompt becomes |
|---|---|---|---|
| `pa_xl__no_lora` | pixelArtDiffusionXL | — | `<subject>, solid blue background` |
| `pa_xl__cb_final_085` | pixelArtDiffusionXL | cb_final | `cbstyle, <subject>, solid blue background` |
| `sdxl__prompt_pixel` | sd_xl_base_1.0 | — | `pixel art, <subject>, solid blue background` |
| `sdxl__cb_final_085` | sd_xl_base_1.0 | cb_final | `cbstyle, <subject>, solid blue background` |

Negative on all four: `blurry, low quality, text, watermark, signature, jpeg artifacts`.

The two head-to-heads that matter:

- **`pa_xl__cb_final_085` vs `pa_xl__no_lora`** — checkpoint already does pixel art; does the LoRA add CB-specific style on top?
- **`sdxl__cb_final_085` vs `sdxl__prompt_pixel`** — if both are asked for pixel art, does the LoRA still win? Strongest evidence the LoRA learned CB specifically rather than generic pixel art.

4 × 10 × 2 = **80 images**, ~3–4 min on an A5000/4090.

---

## 6. Prompt composition

Concise on purpose. Long prefixes drown out both the LoRA and the user prompt.

- **LoRA-on:** `{trigger_words}, {prompt_prefix?}, {subject}, solid blue background`
- **LoRA-off:** `{subject}, solid blue background`
- **LoRA-off with `prompt_prefix_override`:** `{override}, {subject}, solid blue background`

`trigger_words` and `prompt_prefix` come from the LoRA's entry in `loras_under_test`. They are applied **only when a LoRA is active**.

`prompt_prefix_override` is set per-condition. It replaces any prefix that would come from the LoRA, **and applies even when `lora: null`** — that's what makes the prompt-matched baseline (`sdxl__prompt_pixel`) work.

---

## 7. Run a sanity check

```powershell
.\.venv\Scripts\python.exe -m questflow_eval run
```

What happens:
1. `models.py` validates `config/models.json`.
2. ComfyUI pre-flight via `/object_info`.
3. Generation loop with tqdm progress (4 × 10 × 2 = 80 images).
4. Metric pass (CLIP / DINOv2 / LPIPS / FID / pixel / memorization) with 95% bootstrap CIs.
5. Writes `results/{run_id}/report.md` + `metrics.csv` + `metrics.json` + plots + comparison grids.

Open `results/<latest>/report.md` and look at the per-metric table, the aggregate ranking under three weight regimes, and the per-prompt comparison grids (rows = conditions, columns = seeds, same prompt).

What good output looks like:
- `pa_xl__cb_final_085` should beat `pa_xl__no_lora` on DINOv2 fidelity — that's the LoRA adding CB style on top of the pixel-art checkpoint.
- `sdxl__cb_final_085` vs `sdxl__prompt_pixel` is the fair fight; if the LoRA still wins DINOv2 here, that's strong evidence.
- CLIPScore on LoRA conditions will likely drop a little — that's the expected style-vs-content trade-off, not a bug.
- The `pixel_art` column should differ across conditions. It's computed on the raw 1024×1024 (not the snapped 64×64) so it measures whether the model natively produces pixel-art-shaped output rather than whether the snapper can fake it.

---

## 8. Common workflows

### 8.1 Compare training epochs to find the best one

Drop every `cb-NNNNNN.safetensors` into ComfyUI's `loras/`, then expand `models.json`:

```json
{
  "loras_under_test": [
    {
      "id": "cb_e1", "name": "CB epoch 1", "file": "cb-000001.safetensors",
      "trigger_words": "cbstyle", "prompt_prefix": "",
      "negative_prompt": "blurry, low quality, text, watermark, signature, jpeg artifacts",
      "reference_dir": "data/reference_sprites/cb/"
    }
    // … one entry per epoch …
  ],
  "conditions": [
    { "id": "pa_xl__no_lora",     "checkpoint": "pixelart_xl", "lora": null,    "strength": 0.0,  "strength_clip": 0.0  },
    { "id": "pa_xl__cb_e1_085",   "checkpoint": "pixelart_xl", "lora": "cb_e1", "strength": 0.85, "strength_clip": 0.80 }
    // … one condition per epoch …
  ]
}
```

Run normally. Read across conditions:
- **DINOv2 fidelity** should climb across epochs as the LoRA learns.
- **CLIPScore** should stay roughly flat. A sharp late-epoch drop = overfitting / prompt-ignoring.
- **Memorization NN distance** should *not* shrink dramatically. If it does, the LoRA is copying training data.
- The aggregate score picks the winner. The "elbow" of DINOv2-vs-CLIPScore is usually the right epoch.

### 8.2 Sweep LoRA strengths

After picking an epoch, sweep strengths around production (0.85):

```json
"conditions": [
  { "id": "pa_xl__cb_s050", "checkpoint": "pixelart_xl", "lora": "cb_final", "strength": 0.50, "strength_clip": 0.47 },
  { "id": "pa_xl__cb_s070", "checkpoint": "pixelart_xl", "lora": "cb_final", "strength": 0.70, "strength_clip": 0.66 },
  { "id": "pa_xl__cb_s085", "checkpoint": "pixelart_xl", "lora": "cb_final", "strength": 0.85, "strength_clip": 0.80 },
  { "id": "pa_xl__cb_s100", "checkpoint": "pixelart_xl", "lora": "cb_final", "strength": 1.00, "strength_clip": 0.94 }
]
```

The 0.85:0.80 ratio (~0.94) is the production setting; keep it.

### 8.3 Add a different checkpoint

Append to `checkpoints` and add conditions:

```json
"checkpoints": [
  { "id": "pixelart_xl", "file": "pixelArtDiffusionXL_spriteShaper.safetensors", "notes": "..." },
  { "id": "sdxl_base",   "file": "sd_xl_base_1.0.safetensors",                    "notes": "..." },
  { "id": "juggernaut",  "file": "juggernautXL_v9.safetensors",                  "notes": "alt SDXL fine-tune" }
],
"conditions": [
  { "id": "juggernaut__cb_085", "checkpoint": "juggernaut", "lora": "cb_final", "strength": 0.85, "strength_clip": 0.80 }
]
```

Drop the file into ComfyUI's `models/checkpoints/` first, then restart ComfyUI so its file list refreshes.

### 8.4 Prompt-matched baselines (`prompt_prefix_override`)

When comparing a pixel-art LoRA against a base SDXL with no pixel-art bias, the LoRA-off baseline trivially "loses" DINOv2 fidelity because pixel art ≠ photo. Give the baseline a fighting chance with `prompt_prefix_override`:

```json
{
  "id": "sdxl__prompt_pixel",
  "checkpoint": "sdxl_base",
  "lora": null,
  "strength": 0.0,
  "strength_clip": 0.0,
  "prompt_prefix_override": "pixel art"
}
```

That produces `pixel art, <subject>, solid blue background`. The comparison `sdxl__cb_final_085` vs `sdxl__prompt_pixel` is then the fair fight — if the LoRA still wins DINOv2, it's because it learned CB *specifically*, not generic pixel art.

The override also overrides a LoRA's `prompt_prefix` on LoRA-on conditions if you want to test what a custom prefix changes.

### 8.5 Iterate on weights without regenerating

Edit metric weights in `config/eval_config.yaml`, then:

```powershell
.\.venv\Scripts\python.exe -m questflow_eval report-only --run-id <existing-id>
```

No images are regenerated; aggregate + report re-run in seconds.

### 8.6 Re-run metrics on existing images

If you change the metric code (or the prompt composer, after generation finished) and want to score the existing PNGs without regenerating:

```powershell
.\.venv\Scripts\python.exe -m questflow_eval metrics-only --run-id <existing-id>
```

⚠️ If you changed prompts, the existing PNGs reflect the *old* prompts. CLIPScore in particular will be misleading. Regenerate (delete the old `run_id` folder and re-run from scratch) for any prompt change.

### 8.7 Resume an interrupted run

If a sweep is killed mid-way (power, OOM, ComfyUI crash) and you haven't changed prompts:

```powershell
.\.venv\Scripts\python.exe -m questflow_eval run --resume --run-id <existing-id>
```

Cells with `raw/<condition>/<prompt>_<seed>.png` already on disk are skipped.

### 8.8 Full sweep for the final report

```powershell
.\.venv\Scripts\python.exe -m questflow_eval run --full
```

Swaps the 10-prompt set for `config/prompt_set.full.yaml` (40 prompts). Cost scales with the number of conditions. 4 conditions × 40 prompts × 2 seeds = **320 images, ~12 min**.

---

## 9. Troubleshooting (issues actually encountered)

### `Torch not compiled with CUDA enabled`

Torch reverted to the CPU wheel. Usually happens when `uv sync` ran against a `pyproject.toml` without the CUDA index pin. The shipped `pyproject.toml` already has `[tool.uv.sources]` pinning torch/torchvision to `https://download.pytorch.org/whl/cu121`, so a clean `uv sync` should work. If it still grabs CPU:

```powershell
uv pip install --reinstall --index-url https://download.pytorch.org/whl/cu121 torch==2.3.1 torchvision==0.18.1
```

Verify with the one-liner from §2.

### `Secondary flag is not valid for non-boolean flag`

Old typer (0.12.x) + new click (≥8.4) incompatibility. The shipped `pyproject.toml` requires `typer>=0.15.0` which fixes it. If you see this, `uv sync` should resolve. If not:

```powershell
uv pip install -U "typer>=0.15"
```

### `ComfyUI prompt … completed without an image output`

ComfyUI executed the workflow but no node produced a saved image. The harness now appends an explicit `SaveImage` node to every workflow specifically to prevent this. If you still hit it:
- Check `curl http://127.0.0.1:8188/history/<prompt_id>` — `outputs: {}` confirms the symptom.
- Look for `execution_error` in the same JSON. A missing custom node (`Power Lora Loader (rgthree)`) is the most common cause; install rgthree-comfy.

### ComfyUI pre-flight warns "file not listed"

ComfyUI caches its model list at startup. If you dropped a file in while ComfyUI was running, **restart ComfyUI**. Warnings are non-fatal; the run will continue and fail later if the file genuinely isn't there.

### `metrics-only` fails or `report-only` shows no grids

Both depend on `results/<run_id>/raw/` and `snapped/` already existing. Make sure the run actually got past generation. Spot-check:

```powershell
ls results\<run-id>\raw
```

You should see one folder per condition with one PNG per (prompt, seed_index) pair.

### Hard crash / black screen / instant reboot during run

Not a Python error — almost always one of:
- **PSU spike** when SDXL ramps from idle to full draw while CLIP+DINOv2 also load. Check Event Viewer → System for `Kernel-Power 41`.
- **WDDM VRAM contention** when ComfyUI keeps SDXL resident while metrics load CLIP/DINOv2. Close ComfyUI between generation and metric pass — see §10.

Use `nvidia-smi -l 2` in another terminal to watch temp and VRAM during a run. >83 °C sustained or >22 GB on the A5000 is the danger zone.

### Pydantic validation error on `models.json`

The error message names the field. Common issues:
- duplicate `id` (must be globally unique across checkpoints, LoRAs, and conditions)
- a condition's `lora` doesn't match any `loras_under_test[].id`
- `lora: null` with `strength != 0` (use `0.0` for both strengths on LoRA-off conditions)

### VS Code "package not installed" hints

VS Code's Python extension is pointing at the wrong interpreter. Ctrl+Shift+P → "Python: Select Interpreter" → pick `eval/.venv/Scripts/python.exe`. The hints will clear.

### Identical results across conditions

Check `results/<run_id>/workflows/<condition_id>.json`. Node 6's `seed` must differ between cells of the same condition (different `seed_index`) but match between conditions at the same `(prompt, seed_index)` — that's the common-random-numbers design. If seeds look identical everywhere, the seed derivation isn't running; file a bug.

### Wide CIs in the report

20 samples/condition is small. If two conditions' CIs overlap, the difference isn't statistically meaningful at this sample size. Either accept that as the honest answer, run `--full` (3× more samples), or up `seeds_per_prompt` in `config/eval_config.yaml`.

---

## 10. GPU memory: SDXL + metrics on one GPU

The metric pass loads CLIP (~1.7 GB) + DINOv2 (~0.7 GB) + LPIPS (~0.3 GB) ≈ 2.7 GB on top of whatever ComfyUI still has resident. On a 24 GB card (A5000/3090/4090) you're usually fine, but ComfyUI doesn't proactively unload SDXL after generation, so the peak can spike.

Cleanest approach when you hit OOM or crashes:

```powershell
# After the generation phase finishes, before the metric pass:
# 1. close ComfyUI
# 2. re-run with --resume so the metric pass runs on the existing images
.\.venv\Scripts\python.exe -m questflow_eval metrics-only --run-id <id>
```

`metrics-only` does not call ComfyUI at all — only the local models load.

---

## 11. File-by-file reference

| Path | What it is | When you touch it |
|---|---|---|
| `config/models.json` | Checkpoints, LoRAs, sweep conditions, sampler, target size | Every time you add a LoRA / epoch / checkpoint |
| `config/eval_config.yaml` | Metric weights, RNG seed, sample counts | When you want to re-weight or change sample counts |
| `config/prompt_set.yaml` | The 10 quick-profile prompts | Rarely — keep stable so results are comparable across runs |
| `config/prompt_set.full.yaml` | The 40 full-profile prompts | Rarely |
| `data/reference_sprites/<lora_id>/` | Held-out real sprites per LoRA | Once per LoRA family |
| `results/<run_id>/report.md` | The output you read | After every run |
| `results/<run_id>/metrics.csv` | Per-cell raw metric values | For spreadsheet analysis |
| `results/<run_id>/grids/` | Per-prompt comparison PNGs | The visual evidence for the report |
| `pyproject.toml` / `uv.lock` | Python deps | Only if upgrading deps |

---

## 12. Cheat-sheet

```powershell
# First-time setup
cd eval
uv venv --python 3.11
uv sync

# Quick run (4 conditions, ~3 min)
uv run python -m questflow_eval run

# Iterate on weights, no regeneration
uv run python -m questflow_eval report-only --run-id <id>

# Re-score existing images after metric-code changes
uv run python -m questflow_eval metrics-only --run-id <id>

# Resume after a crash (only safe if you didn't change prompts)
uv run python -m questflow_eval run --resume --run-id <id>

# Full 40-prompt sweep for the final report
uv run python -m questflow_eval run --full

# Verify CUDA
uv run python -c "import torch; print(torch.__version__, torch.cuda.is_available())"

# Run tests
uv run pytest
```
