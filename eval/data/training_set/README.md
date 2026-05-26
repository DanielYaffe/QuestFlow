# Training Set (for direct memorization check)

Optional folder. Drop the **exact PNGs that were used to train each LoRA** under a subfolder named after the LoRA family. Used by the `memorization` metric to compute "how close is the LoRA's output to images it was explicitly trained on" — the strictest copying-detection test available.

## Layout

```
data/training_set/
  cb/
    amphare.png
    artillerex.png
    ...
```

The path comes from `training_dir` on each LoRA entry in [../../config/models.json](../../config/models.json). If `training_dir` is absent or the folder is empty, the memorization metric falls back to measuring against the held-out `reference_dir` instead, and the report column is labelled `nn_distance_held_out` rather than `memorization`.

## Why both folders

- **`reference_sprites/`** — held-out sprites the LoRA never saw. Used for DINOv2 style fidelity + FID. Measures style-learning quality.
- **`training_set/`** — sprites the LoRA was directly trained on. Used only by the memorization metric. Measures whether the LoRA learned a style or memorised specific images.

The two folders must not overlap — that's the whole point.

## Privacy

Gitignored. Training data stays on your machine.
