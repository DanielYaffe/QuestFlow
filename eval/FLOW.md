# Evaluation Flow — End-to-End

Companion to [lora-testing.md](lora-testing.md). This document explains what happens at runtime when you run the eval harness, from the config files you edit to the report you read at the end.

---

## Inputs you control

| File | What you edit | Why |
|---|---|---|
| [config/models.json](config/models.json) | Checkpoints, LoRAs under test, sweep conditions, sampler | Single source of truth for what gets compared. Add a new LoRA here without touching code. |
| [config/prompt_set.yaml](config/prompt_set.yaml) | The 10 (or 40, with `--full`) fixed evaluation prompts | Frozen so results are reproducible across runs |
| [config/eval_config.yaml](config/eval_config.yaml) | Metric weights, RNG seed, seeds-per-prompt, output paths | Aggregation knobs; can iterate without regenerating images |
| `data/reference_sprites/{lora_id}/` | Held-out real sprites per LoRA | Ground-truth distribution for DINOv2 fidelity and FID |

You never edit Python code to add a LoRA. Drop the `.safetensors` into ComfyUI's `models/loras/`, add an entry under `loras_under_test` in `models.json`, add one or more `conditions` referencing its `id`, drop reference sprites under `data/reference_sprites/{lora_id}/`, re-run.

---

## Stage 1 — Pre-flight (runner startup)

1. `models.py` parses [config/models.json](config/models.json) through a Pydantic schema → typed `ModelsConfig`. Fails fast on duplicate ids, conditions that reference unknown ids, or `lora: null` paired with `strength != 0`.
2. `comfy_client.system_stats()` → confirms ComfyUI is reachable at `COMFY_ENDPOINT` (default `http://127.0.0.1:8188`).
3. `comfy_client.object_info()` → confirms every `checkpoint.file`, `always_on_loras[].file`, and `loras_under_test[].file` exists on the ComfyUI side. Missing files abort the run before any GPU time is spent.
4. SHA-256 of each model file is recorded (read from the local ComfyUI `models/` dir if accessible; otherwise marked `available_locally: false`).
5. `run_id` is resolved to `{ISO_timestamp}_{git_sha}`. `results/{run_id}/` is created.

## Stage 2 — Sweep build (`sweep.py`)

The runner iterates `models.json.conditions` **directly** — there is no Cartesian product in code. For each condition × prompt × seed_index, an `EvalCell` is emitted:

```
EvalCell(
  condition_id,   # from models.json
  prompt_id,
  seed_index,     # [0, 1] in the quick profile
  seed,           # = hash(prompt_id, seed_index) mod 2^32
)
```

The same seed is reused **across all conditions** for a given `(prompt_id, seed_index)`. This is the common-random-numbers variance reduction trick: differences between conditions are attributable to the model, not the noise.

## Stage 3 — Per-cell generation (`runner.py`)

For each cell, in order (concurrency = 1 — a single 4090 doesn't speed up with queue depth > 1, and serialising avoids race conditions in ComfyUI's history endpoint):

1. **Build workflow.** `workflow_patcher.build(condition, prompt_meta, seed, sampler)` starts from [workflow_templates/sdxl_power_lora.json](workflow_templates/sdxl_power_lora.json) (a snapshot of the production template — refresh per [workflow_templates/README.md](workflow_templates/README.md)) and patches:
   - Node `"1".inputs.ckpt_name` → checkpoint file
   - Node `"2".inputs.lora_1` → DMD2 (always on, mirrors production)
   - Node `"2".inputs.lora_2` → condition's LoRA, or `on: false` if `lora: null`
   - Node `"3".inputs.text` → positive prompt (composed below)
   - Node `"4".inputs.text` → negative prompt
   - Node `"5".inputs.width/height`, Node `"6".inputs.seed/steps/cfg/sampler_name/scheduler`
2. **Compose prompt.** `prompt_composer.compose(lora_meta, user_prompt)` builds positive/negative — mirrors [../backend/src/services/generation/imagePromptComposer.ts](../backend/src/services/generation/imagePromptComposer.ts):
   - Positive: `{trigger_words}, {prompt_prefix}, {user_prompt}, solid flat blue background`
   - Negative: `{lora.negative_prompt}` (+ optional extras from `eval_config.yaml`)
3. **Submit.** `comfy_client.submit_prompt(workflow)` → POST `/prompt` → returns `prompt_id`.
4. **Wait.** `comfy_client.wait_for_history(prompt_id)` polls `GET /history/{id}` every 1.5s (timeout 180s).
5. **Fetch.** `comfy_client.fetch_image(filename, subfolder, type_)` → GET `/view` → bytes.
6. **Persist raw.** Save 1024×1024 PNG to `results/{run_id}/raw/{condition_id}/{prompt_id}_{seed_index}.png`.
7. **Snap.** Apply the Python Pixel-Snapper approximation (k-means quantise to 16 colors, downsample via nearest neighbour to `target_size_px` from `models.json`). Save to `snapped/...`.

On `--resume`, cells whose `raw/*.png` already exists are skipped.

## Stage 4 — Metric pass

Runs once after generation completes, so DINOv2 + LPIPS + CLIP + FID don't compete with SDXL for GPU memory.

### The two models — what each one checks

- **CLIP (ViT-L/14)** is image-text. Used for **CLIPScore** — "did the model draw what I asked for?" Semantic content: glasses, two heads, holding a sword, fire element. If you asked for a winged lizard and got a slime, CLIPScore drops.
- **DINOv2 (ViT-B/14)** is image-only. Used for **style fidelity** — "does it look like Cassette Beasts?" Visual structure: shape, texture, palette, line weight. Also drives the **memorization NN** check.

You need both. A LoRA that nails style but ignores prompts is useless. A LoRA that follows prompts but doesn't look like CB didn't learn anything.

### Size and background normalisation (important)

The reference sprites are small (~64–96 px) on transparent or solid backgrounds. The generated images are 1024×1024 with whatever background the workflow produced. Two ways this could bias the metrics — both handled:

1. **Size.** Both CLIP and DINOv2 take 224×224 inputs. Both inputs go through the model's own preprocessor (bicubic resize + center crop + ImageNet normalisation). The size mismatch dissolves at the embedding stage. **We do not downscale the generated image to match the sprite** — that throws away information. Both sides feed the model at its native input resolution.

2. **Background.** Generated images have a `solid flat blue background` from the prompt; the workflow's `easy imageRemBg` node strips it. Before metric extraction we **composite both reference sprites and generated images onto the same neutral background** (white). Otherwise DINOv2 would partially learn "model A paints on blue, model B paints on grey" — irrelevant to style. Pseudocode:

   ```
   def prep_for_metric(img):
       img = ensure_rgba(img)            # ensure alpha channel exists
       if alpha_is_uniform(img):
           img = remove_bg(img)          # rembg fallback if generation kept the blue
       return composite_on_white(img)    # both sides land on identical background
   ```

   Reference sprites and generated images both go through this exact function before CLIP / DINOv2 / FID. Documented as a normalisation step; any residual rembg failures are noted in the caveats.

### What runs on what

| Metric | Input | Resolution |
|---|---|---|
| CLIPScore | raw generation, bg-normalised | model preprocessor → 224 |
| DINOv2 style fidelity | raw generation + reference, both bg-normalised | model preprocessor → 224 |
| Memorization NN | raw generation + reference, both bg-normalised | model preprocessor → 224 |
| LPIPS diversity | raw generation, downsampled to 256 | 256 |
| FID | raw generation + reference, both bg-normalised | clean-fid handles resize to 299 |
| Pixel metrics (palette/sharpness/grid) | **snapped 64×64**, no reference | 64 |

`pixel_metrics.py` is the odd one out — it intentionally ignores the reference set because palette size and edge sharpness are intrinsic properties, not relative ones, and they only make sense on the snapped output (the thing production actually ships).

### Per `(condition, prompt)` group:

- `metrics/clipscore.py` — CLIP ViT-L/14 image-text cosine × 2.5, on raw 1024 images after bg-normalisation.
- `metrics/dinov2_similarity.py` — DINOv2 ViT-B/14 cosine to reference centroid + max-pair similarity, on bg-normalised images.
- `metrics/lpips_diversity.py` — pairwise LPIPS (AlexNet backbone) within the group, on raw images downsampled to 256.
- `metrics/pixel_metrics.py` — palette size, edge sharpness (mean Sobel magnitude), grid-alignment error on the snapped 64×64.

### Per condition (across all prompts):

- `metrics/fid.py` — Clean-FID (`mode='clean'`) condition vs reference set, both bg-normalised before clean-fid's internal pipeline.
- `metrics/memorization.py` — for each generated image, min DINOv2 cosine distance to any reference image; report 5th-percentile per condition.

Every metric returns per-cell arrays and per-condition aggregates with **mean + 95% bootstrap CI (n=1000)**, seeded from `eval_config.yaml:rng_seed`.

Outputs: `results/{run_id}/metrics.csv` (one row per cell) and `metrics.json` (aggregates + CIs + model SHA-256s).

## Stage 5 — Aggregation (`aggregate.py`)

1. Normalise each metric to `[0, 1]` where 1 = better (rescaling rules per metric — see `lora-testing.md` §7).
2. Apply weights from `eval_config.yaml`.
3. Produce a per-condition aggregate score and a ranked table.
4. Recompute under **style-heavy** (0.5 / 0.1 / …) and **prompt-heavy** (0.4 / …) weight regimes for sensitivity analysis.

## Stage 6 — Report (`report.py`)

Renders into `results/{run_id}/`:

- `report.md` — methodology (cited), per-metric tables (mean ± 95% CI), ranking + sensitivity, caveats, embedded plots and grids. Training-stats section is replaced by an explicit "logs unavailable — section omitted" note.
- `plots/` — CLIPScore bars, DINOv2 heatmap, LPIPS box plot, FID bars, ranked aggregate (matplotlib/seaborn).
- `grids/prompt_{id}_comparison.png` — one image per prompt, rows = conditions, columns = seeds, with a header row labelling each condition.

## Stage 7 — What you do with the output

- Open `results/{run_id}/report.md` in any markdown viewer.
- To iterate on metric weights: edit `eval_config.yaml`, then `python -m questflow_eval report-only --run-id <id>` — no image regeneration.
- To add a newly-trained LoRA: drop `.safetensors` into ComfyUI's `models/loras/`, add entries in `models.json`, drop reference sprites under `data/reference_sprites/{new_id}/`, re-run.

---

## Architecture notes

### How the eval reaches ComfyUI

The eval talks **directly to ComfyUI's HTTP API**, not to the QuestFlow Node backend. Three reasons:

1. Your backend's [../backend/src/controllers/spriteController.ts](../backend/src/controllers/spriteController.ts) is wrapped in auth, BullMQ queueing, S3 uploads, MongoDB writes, and SSE streaming — none of which the eval needs. The eval only needs `(workflow JSON) → (PNG bytes)`.
2. Going through your backend would couple eval results to production-only concerns. If you rotate auth or change the queue config, the eval would break for unrelated reasons.
3. The three endpoints we need are public on ComfyUI itself: `POST /prompt`, `GET /history/{id}`, `GET /view`. Your backend hits the same endpoints. The eval is just a second, simpler client of the same ComfyUI instance.

This also means the eval works **even when the Node backend is not running**. ComfyUI by itself is enough.

`comfy_client.py` reads `COMFY_ENDPOINT` from `eval_config.yaml` (default `http://127.0.0.1:8188`) and uses `tenacity` for transient-error retries on each HTTP call. Concurrency = 1 — a single GPU doesn't speed up SDXL with queue depth > 1, and serialising avoids race conditions in ComfyUI's history endpoint.

### How the Pixel Snapper fits in

Production uses the Rust→WASM `spritefusion_pixel_snapper` crate, called from [../backend/src/services/generation/pixelSnapper.ts](../backend/src/services/generation/pixelSnapper.ts). Calling WASM from Python is awkward, so the eval does **two things in parallel** instead of one:

1. **Keeps the raw 1024×1024 PNG from ComfyUI.** This is what feeds CLIP, DINOv2, LPIPS, FID, and memorization. They want native-resolution input; downsampling before embedding throws away information.
2. **Approximates the snap in Python** for the pixel-art-specific metrics. A small `pixel_snapper.py` helper:
   - Quantises to 16 colours via `PIL.Image.quantize(colors=16, method=Quantize.MEDIANCUT)` — same end-effect as the Rust crate's k-means palette reduction.
   - Downsamples to `target_size_px` (64 from `models.json`) via `Image.resize(..., Image.NEAREST)`.
   - Saves to `snapped/{condition_id}/{prompt_id}_{seed}.png`.

The approximation feeds **only** `pixel_metrics.py`. Any divergence between the Rust WASM output and the Python approximation is acknowledged in the caveats — for pixel-art-ness metrics it doesn't matter, because we're measuring within-condition properties (palette size, sharpness) at the same approximation across all conditions.

The eval **never modifies or imports** [../backend/src/services/generation/pixelSnapper.ts](../backend/src/services/generation/pixelSnapper.ts). It just reproduces the visual effect for measurement purposes.

---

## Diagram

```
+------------------+        +--------------------+        +-----------------+
| models.json      |        | prompt_set.yaml    |        | eval_config.yaml|
| (user-edited)    |        | (fixed prompts)    |        | (weights, RNG)  |
+--------+---------+        +---------+----------+        +--------+--------+
         |                            |                            |
         v                            v                            v
   +-----+----------------------------+----------------------------+-----+
   |                         runner.py                                  |
   |  models.py validate -> sweep.py build cells -> for each cell:      |
   |    workflow_patcher.build -> prompt_composer.compose               |
   +--+---------------------------------------------------+-------------+
      |                                                   |
      v                                                   v
+-----+----------+                              +---------+---------+
| comfy_client   |--HTTP--->  ComfyUI :8188 --->| raw/*.png         |
| /prompt /hist  |<--------                     | snapped/*.png     |
| /view          |                              +---------+---------+
+----------------+                                        |
                                                          v
                                              +-----------+-----------+
                                              |       metrics/        |
                                              | clip dino lpips fid   |
                                              | pixel memorization    |
                                              +-----------+-----------+
                                                          |
                                                          v
                                              +-----------+-----------+
                                              |  aggregate.py +       |
                                              |  report.py            |
                                              +-----------+-----------+
                                                          |
                                                          v
                                              results/{run_id}/report.md
```

---

## Where each TS file maps in Python

| Production TS | Python equivalent in `src/questflow_eval/` | Relationship |
|---|---|---|
| [../backend/src/services/generation/generationService.ts](../backend/src/services/generation/generationService.ts) `patchWorkflow` | `workflow_patcher.py` `build()` | Same node-id patches, same DMD2-at-lora_1 convention |
| [../backend/src/services/generation/imagePromptComposer.ts](../backend/src/services/generation/imagePromptComposer.ts) | `prompt_composer.py` | Same positive/negative composition |
| [../backend/src/config/styles.ts](../backend/src/config/styles.ts) | `config/models.json` | Production hardcodes styles; eval drives them from JSON |
| [../backend/src/workers/spriteWorker.ts](../backend/src/workers/spriteWorker.ts) | `runner.py` | Same per-job flow (generate → snap → persist), but writes locally instead of to S3 and never enters BullMQ |
| [../backend/src/services/generation/pixelSnapper.ts](../backend/src/services/generation/pixelSnapper.ts) (WASM) | `pixel_metrics.py` snap helper | Python approximation; raw 1024 is also kept so high-res metrics aren't affected |
