# LoRA Testing Plan

End-of-project evaluation harness for the custom Cassette Beasts–style LoRA (`cb-000006.safetensors`, trigger `cbstyle`) and a comparison sweep over alternative checkpoints. This document is the plan; companion document [FLOW.md](FLOW.md) explains the runtime flow end-to-end.

---

## 1. Context

QuestFlow generates pixel-art monster sprites via a ComfyUI workflow (`sdxl_power_lora.json` + Power Lora Loader). The production pipeline is described in [../backend/src/services/generation/generationService.ts](../backend/src/services/generation/generationService.ts). It has no evaluation harness; this plan adds one for the final-project report.

Goals:

1. Produce **quantitative statistics** about the LoRA's inference-time behaviour.
2. Run a **comparison sweep** over `{checkpoint} × {LoRA on/off / strength}` and produce a **ranked aggregate score**.
3. Back every metric with an **academic citation** and document **honest caveats** about each.
4. Keep checkpoints and LoRAs **JSON-configurable** so newly trained LoRAs can be plugged in without code changes.
5. Live in a **separate worker** (not the production BullMQ sprite worker).

---

## 2. Decisions

- **Language: Python 3.11.** The evaluation ecosystem (CLIP, LPIPS, FID, DINOv2, cleanfid, torchmetrics, matplotlib) is Python-native with no maintained JS port. ComfyUI is the only boundary between the harness and production, and it speaks HTTP. A JS/TS implementation would shell out to Python anyway.
- **Reference set: provided.** The user has ~50–200 held-out real CB sprites; full DINOv2 / FID style fidelity is enabled.
- **Training logs: not available.** The `training_stats` module is out of scope; the report focuses on inference-time metrics and explicitly notes the omission.
- **Default sweep: quick profile** (~80 images, ~3 min wall time). The matrix is driven from `config/models.json` and can be grown without code changes.
- **Models JSON, not code constants.** All checkpoints, LoRAs, and sweep conditions live in [config/models.json](config/models.json). Adding a new LoRA = appending to JSON.
- **Location: top-level `eval/`.** Sibling of `backend/` and `frontend/`. The eval evaluates the LoRA, not the backend, so it sits at the repo root rather than under `backend/`. The ComfyUI workflow JSON it needs is snapshotted under `workflow_templates/` rather than read from `backend/src/...`.

---

## 3. Folder structure

```
eval/
  lora-testing.md                # this document
  FLOW.md                        # end-to-end runtime flow
  pyproject.toml                 # pinned deps
  requirements.txt               # mirrored deps for pip users
  README.md                      # how to run
  .python-version                # 3.11

  config/
    eval_config.yaml             # metric weights, RNG seed, sample counts
    prompt_set.yaml              # 10 fixed prompts (quick profile)
    prompt_set.full.yaml         # 40 prompts for --full
    models.json                  # USER-EDITABLE: checkpoints + LoRAs + sweep

  data/
    reference_sprites/
      cb_v6/                     # ~50-200 held-out real CB sprites
      README.md                  # provenance, count, resolution

  src/questflow_eval/
    __init__.py
    comfy_client.py              # /prompt, /history, /view HTTP wrapper
    workflow_patcher.py          # mirrors generationService.ts patchWorkflow()
    prompt_composer.py           # mirrors imagePromptComposer.ts
    prompt_set.py                # loads + validates prompt_set.yaml
    models.py                    # loads + validates models.json (Pydantic)
    sweep.py                     # builds (condition, prompt, seed) cells
    runner.py                    # orchestrates the sweep, writes images
    aggregate.py                 # normalises metrics, computes weighted score
    report.py                    # writes CSV/JSON/Markdown/plots/grids
    main.py                      # `python -m questflow_eval` CLI entry

    metrics/
      __init__.py
      clipscore.py
      dinov2_similarity.py
      lpips_diversity.py
      fid.py
      pixel_metrics.py
      memorization.py

  results/
    {run_id}/                    # run_id = ISO timestamp + git sha
      raw/{condition_id}/{prompt_id}_{seed}.png
      snapped/{condition_id}/{prompt_id}_{seed}.png
      metrics.csv
      metrics.json
      report.md
      workflows/{condition_id}.json
      plots/*.png
      grids/prompt_{id}_comparison.png
```

`results/` is gitignored except for one example run committed alongside the final report.

---

## 4. Models JSON — user-editable model & condition catalogue

[config/models.json](config/models.json) is the **single user-edited file** for plugging in new LoRAs and checkpoints. Schema:

```json
{
  "checkpoints": [
    {
      "id": "pixelart_xl",
      "name": "Pixel Art Diffusion XL",
      "file": "pixelArtDiffusionXL.safetensors",
      "notes": "primary base for the cb_pixel style"
    },
    {
      "id": "sdxl_base",
      "name": "SDXL Base 1.0",
      "file": "sd_xl_base_1.0.safetensors",
      "notes": "vanilla baseline"
    }
  ],

  "always_on_loras": [
    {
      "id": "dmd2",
      "file": "dmd2_sdxl_4step_lora_fp16.safetensors",
      "strength": 1.0,
      "strength_clip": 1.0,
      "notes": "DMD2 4-step distillation — applied to every condition (matches production)"
    }
  ],

  "loras_under_test": [
    {
      "id": "cb_v6",
      "name": "Cassette Beasts v6",
      "file": "cb-000006.safetensors",
      "trigger_words": "cbstyle",
      "prompt_prefix": "monster creature, pixel art, clean outline",
      "negative_prompt": "blurry, photorealistic, 3d render",
      "reference_dir": "data/reference_sprites/cb_v6/",
      "notes": "the LoRA being evaluated"
    }
  ],

  "conditions": [
    { "id": "pa_xl__no_lora",   "checkpoint": "pixelart_xl", "lora": null,    "strength": 0.0,  "strength_clip": 0.0  },
    { "id": "pa_xl__cb_v6_085", "checkpoint": "pixelart_xl", "lora": "cb_v6", "strength": 0.85, "strength_clip": 0.80 },
    { "id": "sdxl__no_lora",    "checkpoint": "sdxl_base",   "lora": null,    "strength": 0.0,  "strength_clip": 0.0  },
    { "id": "sdxl__cb_v6_085",  "checkpoint": "sdxl_base",   "lora": "cb_v6", "strength": 0.85, "strength_clip": 0.80 }
  ],

  "sampler": {
    "steps": 4,
    "cfg": 1.2,
    "sampler_name": "euler",
    "scheduler": "simple",
    "width": 1024,
    "height": 1024
  },

  "target_size_px": 64
}
```

**Editing rules:**

- **Add a newly-trained LoRA** → append to `loras_under_test` (with its file, trigger, prefix, reference_dir), then add one or more `conditions` referencing its `id`.
- **Add a checkpoint** → append to `checkpoints`, then add conditions.
- `always_on_loras` mirrors what production bakes in (DMD2 at `lora_1`). These apply to every condition and are not part of the sweep.
- `lora: null` = LoRA-off baseline (only `always_on_loras` apply).
- `reference_dir` is per-LoRA so each LoRA can have its own held-out reference set.

**Validation** (`models.py` via Pydantic):

- Checks every `file` against ComfyUI's `/object_info` at pre-flight.
- Rejects duplicate `id`s.
- Rejects conditions referencing unknown checkpoint/LoRA ids.
- Rejects `lora: null` with `strength != 0`.

The runner enumerates `conditions` directly — there is no Cartesian product in code. The user owns the matrix.

---

## 5. Sweep matrix (default)

Driven by the default `models.json`:

| condition.id | checkpoint | LoRA | strength |
|---|---|---|---:|
| `pa_xl__no_lora` | pixelArtDiffusionXL | (DMD2 only) | 0.00 |
| `pa_xl__cb_v6_085` | pixelArtDiffusionXL | cb-000006 | 0.85 |
| `sdxl__no_lora` | sd_xl_base_1.0 | (DMD2 only) | 0.00 |
| `sdxl__cb_v6_085` | sd_xl_base_1.0 | cb-000006 | 0.85 |

Plus 10 prompts × 2 seeds = **80 images, ~3 min on a 4090.** 20 images/condition for the metrics.

20 samples/condition gives wide bootstrap CIs on FID — this is acknowledged in §10. DINOv2 similarity (more stable at small n) is the primary fidelity metric. To grow the sweep (more LoRA strengths, side-by-side LoRA comparisons, more checkpoints) append to `models.json`. `--full` swaps in `prompt_set.full.yaml` (40 prompts × 3 seeds) for a deeper end-of-project run.

---

## 6. Metrics

Two models do most of the work:

- **CLIP (ViT-L/14)** is image-text. It tells us *did the model draw what I asked for* — glasses, two heads, holding a sword, fire element. Drives **CLIPScore**.
- **DINOv2 (ViT-B/14)** is image-only, self-supervised. It tells us *does it look like Cassette Beasts* — shape, texture, palette, line weight. Drives **style fidelity** and **memorization NN**.

You need both. A LoRA that nails style but ignores prompts is useless; a LoRA that follows prompts but doesn't look like CB didn't learn anything.

### Size and background normalisation (option B)

Reference sprites are small (~64–96 px), often transparent or solid background; generated images are 1024×1024 with whatever background the workflow produced. Two ways this could bias the metrics — both handled:

1. **Size.** Both CLIP and DINOv2 take 224×224 inputs. Both inputs go through each model's own preprocessor (bicubic resize + center crop + ImageNet normalisation). The size gap dissolves at the embedding stage. **We never downscale the generation to match the sprite** — that throws away information. Both sides feed each model at its native input resolution.

2. **Background normalisation (option B — composite both onto identical background).**
   - Production's workflow already includes an `easy imageRemBg` node that strips the prompt-injected `solid flat blue background`. We keep that step.
   - Then a shared `prep_for_metric(img)` helper composites the result onto a **single neutral background** (white), and does the same to every reference sprite. Both sides land on identical pixels behind the subject.
   - If a generation kept its background somehow (`imageRemBg` failed), a `rembg` Python fallback removes it before compositing.
   - We chose option B over option A (strip both, compare on transparent) because compositing onto a fixed colour is more robust than handing transparent-PNG behaviour over to each metric's internal resizer — some metric libraries collapse alpha channels in surprising ways.
   - Reasoning: without normalisation, DINOv2 would partially learn "model A paints on blue, model B paints on grey", which is irrelevant to style.

### What runs on what input

| Metric | Input | Resolution |
|---|---|---|
| CLIPScore | raw generation, bg-normalised | model preprocessor → 224 |
| DINOv2 style fidelity | raw generation + reference, both bg-normalised | model preprocessor → 224 |
| Memorization NN | raw generation + reference, both bg-normalised | model preprocessor → 224 |
| LPIPS diversity | raw generation, downsampled to 256 | 256 |
| FID | raw generation + reference, both bg-normalised | clean-fid handles resize to 299 |
| Pixel metrics (palette/sharpness/grid) | **snapped 64×64**, no reference | 64 |

`pixel_metrics.py` is the odd one out — it intentionally ignores the reference set because palette size and edge sharpness are intrinsic properties, not relative ones, and they only make sense on the snapped output (the thing production ships).

### Module-level summary

| Module | Metric | Reference |
|---|---|---|
| `clipscore.py` | `2.5 · max(0, cos(CLIP_img, CLIP_txt))` with ViT-L/14, on bg-normalised images | Hessel, Holtzman, Forbes, Le Bras, Choi 2021 — *CLIPScore: A Reference-free Evaluation Metric for Image Captioning* |
| `dinov2_similarity.py` | Mean cosine(DINOv2 emb generated, mean DINOv2 emb reference); max-pair similarity; both sides bg-normalised | Oquab et al. 2023 — *DINOv2*; method adapted from Ruiz et al. 2023 — *DreamBooth* and Sohn et al. 2023 — *StyleDrop* |
| `lpips_diversity.py` | Mean pairwise LPIPS (AlexNet) within `(prompt, condition)`, on raw images downsampled to 256 | Zhang, Isola, Efros, Shechtman, Wang 2018 — *The Unreasonable Effectiveness of Deep Features as a Perceptual Metric* |
| `fid.py` | Clean-FID (mode `'clean'`) condition vs reference set, both bg-normalised | Heusel et al. 2017; Parmar, Zhang, Zhu 2022 — *On Aliased Resizing and Surprising Subtleties in GAN Evaluation* |
| `pixel_metrics.py` | Palette size, edge sharpness (mean Sobel), grid-alignment error, on the snapped 64×64 | Task-specific proxy |
| `memorization.py` | Min cosine distance (DINOv2) per generated image vs reference set; 5th-percentile per condition | Carlini et al. 2023 — *Extracting Training Data from Diffusion Models*; Somepalli et al. 2023 — *Diffusion Art or Digital Forgery?* — **caveat:** training set unavailable, so reference set is used as a proxy. Documented in §10. |

Every metric returns per-sample arrays plus per-condition aggregates with **mean + 95% bootstrap CI (n=1000)**. The CI matters: without it, "0.71 vs 0.69" is meaningless — overlapping intervals tell you the difference isn't real.

---

## 6a. What you get at the end — example output

The report shows **per-metric scores with 95% confidence intervals**, not just one aggregate number. Three tables in `results/{run_id}/report.md`:

**Per-metric table** — every metric scored independently, so you can see exactly where each condition wins or loses:

```
condition              CLIPScore         DINOv2 fidelity   FID            LPIPS              Pixel-art          Memorization
                       (mean ± 95% CI)   (mean ± 95% CI)   (mean ± CI)    diversity (m±CI)   (m±CI)             (m±CI, higher=better)
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
pa_xl__cb_v6_085       0.74 [0.71, 0.77] 0.81 [0.78, 0.84] 142 [128, 156] 0.43 [0.40, 0.46]  0.88 [0.85, 0.91]  0.31 [0.27, 0.35]
pa_xl__no_lora         0.71 [0.68, 0.74] 0.42 [0.38, 0.46] 287 [261, 314] 0.51 [0.47, 0.55]  0.62 [0.58, 0.66]  0.55 [0.50, 0.60]
sdxl__cb_v6_085        0.69 [0.66, 0.72] 0.74 [0.71, 0.77] 178 [161, 195] 0.46 [0.43, 0.49]  0.71 [0.67, 0.75]  0.34 [0.30, 0.38]
sdxl__no_lora          0.73 [0.70, 0.76] 0.31 [0.27, 0.35] 312 [285, 339] 0.49 [0.45, 0.53]  0.41 [0.37, 0.45]  0.62 [0.57, 0.67]
```

You read it like this: if `pa_xl__cb_v6_085` scores DINOv2 = 0.81 [0.78, 0.84] and `pa_xl__no_lora` scores 0.42 [0.38, 0.46], **the intervals don't overlap → the LoRA's style effect is statistically meaningful**. If two intervals overlap heavily, that's reported honestly rather than hidden behind a single number.

**Aggregate ranking** — normalised + weighted across all metrics into one final score:

```
condition              Aggregate score   Rank
─────────────────────────────────────────────
pa_xl__cb_v6_085       0.78              1
sdxl__cb_v6_085        0.66              2
pa_xl__no_lora         0.49              3
sdxl__no_lora          0.35              4
```

**Sensitivity table** — re-ranks the conditions under style-heavy and prompt-heavy weight regimes, so a reader can see whether the #1 condition is robust or whether it only wins because of the default weights:

```
condition              Default rank   Style-heavy rank   Prompt-heavy rank
──────────────────────────────────────────────────────────────────────────
pa_xl__cb_v6_085       1              1                  2
sdxl__cb_v6_085        2              2                  3
pa_xl__no_lora         3              4                  1
sdxl__no_lora          4              3                  4
```

Plus the **plots** (`plots/clipscore_by_condition.png` etc.) and **comparison grids** (`grids/prompt_{id}_comparison.png` — rows = conditions, columns = seeds, same prompt, so you can visually compare LoRA-on vs. LoRA-off at identical noise).

For the final-project report you'd cite the per-metric table for evidence, the aggregate ranking for the headline result, and the sensitivity table to show the result isn't an artefact of the weight choice.

---

## 7. Aggregate score

`aggregate.py` normalises each metric to `[0, 1]` (1 = better) then takes a weighted sum.

| Metric | Default weight | Justification |
|---|---:|---|
| Style fidelity (DINOv2 vs reference) | 0.30 | Primary LoRA objective |
| CLIPScore (prompt alignment) | 0.20 | Must still obey the prompt |
| FID vs reference set | 0.15 | Distributional match (down-weighted, small n) |
| Pixel-art palette + sharpness | 0.15 | Task-specific output requirements |
| LPIPS diversity | 0.10 | Avoids mode collapse |
| Memorization (inverted) | 0.10 | Generalisation |

Weights sum to 1.0 and are exposed in `eval_config.yaml`. The report shows the ranking under default + style-heavy + prompt-heavy weight regimes (**sensitivity analysis**) so the result's robustness to weight choice is visible.

---

## 8. CLI

`typer`-based:

```
python -m questflow_eval run [--config config/eval_config.yaml] [--resume] [--full]
python -m questflow_eval metrics-only --run-id <id>
python -m questflow_eval report-only  --run-id <id>
python -m questflow_eval grids-only   --run-id <id>
```

`metrics-only` and `report-only` let weight/plot iteration happen without regenerating the 80 images.

---

## 9. Reproducibility

- Seeds derived from `(prompt_id, seed_index)` — identical noise across conditions, so differences are attributable to the model not the noise (common-random-numbers variance reduction).
- All metric-side RNG (LPIPS sampling, bootstrap) seeded from `eval_config.yaml:rng_seed`.
- `run_id` includes the QuestFlow git SHA.
- SHA-256 of the LoRA and each checkpoint recorded in `metrics.json`.
- The exact workflow JSON sent to ComfyUI for the first cell of each condition is dumped to `results/{run_id}/workflows/`.
- cuDNN deterministic mode enabled.

---

## 10. Caveats & threats to validity

These appear verbatim in every generated `report.md`:

1. **Small-n FID is unreliable.** Chong & Forsyth 2020 (*Effectively Unbiased FID and Inception Score and where to find them*) show FID is biased downward at small samples. With 20 images/condition FID is indicative, not authoritative; the report down-weights it (0.15) and pairs it with DINOv2.
2. **CLIPScore is out-of-distribution for pixel art.** ViT-L/14 was trained on natural images. Absolute values aren't comparable to COCO-reported numbers; use only for *relative* ranking across conditions in this sweep.
3. **DINOv2 also wasn't trained on sprites**, but generalises better to non-photographic content than CLIP (per Oquab et al.). Still a transfer-learning limitation.
4. **Diversity ≠ quality.** High LPIPS could mean the model avoids mode collapse, or that it's producing garbage that happens to be perceptually varied. Interpret only alongside CLIPScore and DINOv2.
5. **Reference set is finite and user-provided.** Style fidelity is biased toward whatever those sprites depict; composition documented in `data/reference_sprites/README.md`.
6. **Memorization NN uses reference set as a proxy** (training set unavailable). It measures *resemblance to reference* rather than true memorization. A separate run with the training set would tighten this.
7. **No training-loss curves.** Training logs unavailable; inference-time metrics are the only window into LoRA quality.
8. **Weight choice is subjective.** Defaults reflect stated priorities (style > prompt > diversity); sensitivity analysis included.
9. **DMD2 is constant across all conditions** at `lora_1`. The "LoRA off" condition measures DMD2 + checkpoint, not vanilla checkpoint. This is the right comparison because production also uses DMD2.
10. **Pixel-art-specific metrics are heuristic.** Palette/sharpness are not validated against human judgement for pixel art — proxies, not gold standards.
11. **Single-run variance.** Bootstrap CIs capture sampling variance within a run; they don't capture run-to-run fp16 nondeterminism. cuDNN deterministic mode is on to minimise this.

---

## 11. Critical files

**To be created:**

- [lora-testing.md](lora-testing.md) — this document
- [FLOW.md](FLOW.md) — end-to-end runtime flow
- [pyproject.toml](pyproject.toml)
- [config/models.json](config/models.json) — user-editable
- [config/eval_config.yaml](config/eval_config.yaml)
- [config/prompt_set.yaml](config/prompt_set.yaml)
- All Python modules under `src/questflow_eval/`

**Local copies (snapshotted from production; refresh per workflow_templates/README.md):**

- [workflow_templates/sdxl_power_lora.json](workflow_templates/sdxl_power_lora.json) — snapshot of the ComfyUI workflow the harness loads. Refreshed manually when production changes.

**Production references (read-only — the harness mirrors their behaviour but never imports them):**

- [../backend/src/services/generation/generationService.ts](../backend/src/services/generation/generationService.ts) — `patchWorkflow` reference for `workflow_patcher.py`
- [../backend/src/config/styles.ts](../backend/src/config/styles.ts) — sampler params and prompt prefix the harness mirrors
- [../backend/src/services/generation/imagePromptComposer.ts](../backend/src/services/generation/imagePromptComposer.ts) — prompt composition the Python harness mirrors
- [../backend/src/workers/spriteWorker.ts](../backend/src/workers/spriteWorker.ts) — reference for production pipeline behaviour

---

## 12. End-to-end verification

1. `cd eval && uv venv && uv pip install -r requirements.txt`
2. Drop ~50–200 held-out real CB sprite PNGs into `data/reference_sprites/cb_v6/`.
3. Ensure ComfyUI is running at `http://127.0.0.1:8188` and `pixelArtDiffusionXL.safetensors`, `sd_xl_base_1.0.safetensors`, `cb-000006.safetensors`, and `dmd2_sdxl_4step_lora_fp16.safetensors` are all present in its `models/` tree.
4. `python -m questflow_eval run --config config/eval_config.yaml` (quick profile; ~3 min).
5. Open `results/{run_id}/report.md` — should contain the ranked table, all plots, and grids.

**Sanity checks** (documented in the eval `README.md`):

- `pixelArtDiffusionXL + LoRA @ 0.85` should top the style-fidelity ranking.
- `sd_xl_base_1.0 + LoRA off` should bottom the style-fidelity ranking but likely score near-top on CLIPScore (vanilla SDXL is well-aligned with prompts).
- Memorization NN distances should be well above the within-reference-set NN distances; if not, that's itself a reportable finding.
