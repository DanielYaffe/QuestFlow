# Reference Sprites

Held-out real sprites used as the ground-truth distribution for **DINOv2 style fidelity**, **FID**, and **memorization NN** metrics.

## Layout

One folder per LoRA family. The folder name must match the `id` of a LoRA entry in [../../config/models.json](../../config/models.json):

```
data/reference_sprites/
  cb/                # matches loras_under_test[].id = "cb_v6" (or shared across cb epochs)
    cb_001.png
    cb_002.png
    ...
```

(`reference_dir` in `models.json` is a relative path from `eval/`, e.g. `data/reference_sprites/cb/`.)

## Requirements

- **PNG format.** RGBA preferred; the harness handles RGB.
- **Any resolution.** The harness resizes for each metric.
- **~50–200 sprites.** Below 50 the CIs balloon; above 200 you're spending compute for diminishing returns at this profile.
- **Held out from the LoRA training set.** Otherwise fidelity is inflated and the memorization metric is meaningless. If you can't hold any out, note it in the final report.

## Provenance (fill in)

- Source:
- Count:
- Resolution range:
- Selection criteria:
- Held out from training?:
