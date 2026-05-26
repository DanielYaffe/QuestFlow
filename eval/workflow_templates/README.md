# Workflow Templates

Snapshots of ComfyUI workflows the eval uses to generate images. These are **copies** of the production workflow JSON under `backend/src/services/generation/workflows/` in the QuestFlow repo.

The eval keeps its own copy so it's independent of the backend tree and can be moved/published on its own.

## Refreshing the snapshot

Whenever the production workflow changes (new node, different sampler defaults, etc.), refresh the snapshot:

```powershell
# from the eval/ folder
Copy-Item ..\backend\src\services\generation\workflows\sdxl_power_lora.json workflow_templates\sdxl_power_lora.json
```

Then re-run the eval. If the node ids in the new template differ from the ones [workflow_patcher.py](../src/questflow_eval/workflow_patcher.py) patches (`1, 2, 3, 4, 5, 6`), the patcher needs to be updated too.

## Files

- `sdxl_power_lora.json` — Power Lora Loader (rgthree) + DMD2 + KSampler + VAE decode + easy imageRemBg. Eval appends its own SaveImage node at id `100` at runtime so it doesn't depend on rmbg.
