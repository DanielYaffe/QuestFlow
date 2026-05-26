# Follow-ups (not done on this branch)

Tracked here so they don't get lost. None are blockers for the eval itself; all are downstream consequences of changes made here.

## 1. Re-sync lora-testing.md with the other branch's plan doc

**Status:** open.

The methodology in [lora-testing.md](lora-testing.md) describes the plan as it was *before* several iterations that happened during implementation. The actual harness diverged in a few places. The other branch (`feat/architecture-phase1-job-pipeline`) also has a copy that needs the same updates if it's still being used as a reference.

Updates that need to land in `lora-testing.md`:

- **Concise prompt composition.** Trigger words + subject + background phrase only; no `monster creature, pixel art, clean outline` prefix. Documented in [prompt_composer.py](src/questflow_eval/prompt_composer.py) and matches what production should adopt later.
- **`prompt_prefix_override` field on conditions.** Lets a LoRA-off baseline get a stylistic hint (e.g., `pixel art`) so LoRA-vs-baseline isn't a trivial "pixel art vs photo" comparison. Used by `sdxl__prompt_pixel` in the default `models.json`.
- **Default matrix is now epoch comparison, not LoRA-on-vs-LoRA-off.** Seven conditions on `pixelart_xl` covering all training epochs + the final checkpoint + a baseline.
- **Pixel-art metrics run on raw 1024, not snapped 64×64.** The snap forces every condition to look pixel-art-shaped, defeating per-condition comparison. Moved in [pixel_metrics.py](src/questflow_eval/metrics/pixel_metrics.py); methodology note added in caveat #10 of the report template.
- **Memorization metric now has two modes.** Direct training-set comparison when `training_dir` is set on the LoRA (strict copying detection); held-out reference fallback otherwise (style-resemblance proxy). The report's "Memorization basis" note tells the reader which mode applied.
- **Background normalisation (option B from FLOW.md).** Both generated and reference images get composited onto a uniform background before CLIP/DINOv2/FID see them, so background colour doesn't leak into style scores. Implemented in [image_prep.py](src/questflow_eval/image_prep.py).
- **Snapped PNGs composite onto white before quantising** so the background doesn't reappear as a phantom dark fringe after PIL's RGBA→RGB conversion. Implemented in [pixel_snapper.py](src/questflow_eval/pixel_snapper.py).
- **Snapshot of the production workflow JSON** lives in [workflow_templates/sdxl_power_lora.json](workflow_templates/sdxl_power_lora.json) — the harness is self-contained and doesn't read from `backend/src/`. Refresh path documented in [workflow_templates/README.md](workflow_templates/README.md).
- **An explicit `SaveImage` node (id 100)** is appended at runtime by [workflow_patcher.py](src/questflow_eval/workflow_patcher.py) to guarantee an output PNG even if the rmbg node's "Save" sink misbehaves. Should be mentioned in §4 (Modules JSON / generationService mapping).

## 2. Port the alpha-threshold pixel-snapper fix to the production backend

**Status:** in progress on this branch (eval-side investigation done; backend change being written now).

Investigation in eval found that RMBG-1.4 leaves a halo of pixels with low-but-nonzero alpha (5–200) around the subject. The Rust pixel-snapper crate ([backend/vendor/pixel-snapper/src/main.rs](../backend/vendor/pixel-snapper/src/main.rs)) only filters `alpha == 0` from its k-means input — so halo RGB values get full voting weight, steal centroid slots from the subject, and reappear as a fringe in the snapped output. Also makes the subject palette feel "monotone" because centroid budget is wasted on near-identical fringe colours.

**Fix being applied (option 1 from the discussion):** TypeScript pre-processing step in [backend/src/services/generation/pixelSnapper.ts](../backend/src/services/generation/pixelSnapper.ts) that hard-thresholds alpha to 0/255 before handing the PNG to the WASM snapper. No Rust crate fork — keeps upstream pristine.

**Considered and rejected:** modifying the Rust crate directly (forking risk), switching to RMBG-2.0/BiRefNet (the threshold makes the model swap unnecessary), and inserting a ComfyUI alpha-threshold node (adds a custom-node dependency).

**To verify after the fix:** generate a fresh sprite for a prompt that previously showed bleed, confirm the snapped output has clean 0/255 alpha and no halo. Optionally re-run a small eval to see whether the `pixel_art` metric scores improve (the bleed was likely depressing them slightly).
