"""CLI entrypoint: `python -m questflow_eval ...` or `questflow-eval ...`."""
import json
import logging
import sys
from pathlib import Path
from typing import Optional

import typer

from .eval_config import load_eval_config
from .models import load_models_config
from .prompt_set import load_prompt_set
from .report import render_report, write_metrics_outputs
from .runner import compute_metrics, run as run_pipeline
from .sweep import build_cells

app = typer.Typer(add_completion=False, no_args_is_help=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


def _eval_dir() -> Path:
    return Path(__file__).resolve().parents[2]


def _resolve_config(config_path: str) -> Path:
    p = Path(config_path)
    if not p.is_absolute():
        p = _eval_dir() / p
    if not p.exists():
        raise FileNotFoundError(f"config not found: {p}")
    return p


@app.command()
def run(
    config: str = typer.Option("config/eval_config.yaml", help="path to eval_config.yaml"),
    models_path: str = typer.Option("config/models.json", help="path to models.json"),
    full: bool = typer.Option(False, help="use prompt_set.full.yaml instead of prompt_set.yaml"),
    resume: bool = typer.Option(False, help="skip cells whose raw PNG already exists"),
    run_id: Optional[str] = typer.Option(None, "--run-id", help="reuse an existing run_id (for --resume)"),
) -> None:
    """Run the full sweep: generate → metrics → report."""
    eval_dir = _eval_dir()
    cfg = load_eval_config(_resolve_config(config))
    models = load_models_config(_resolve_config(models_path))
    prompt_path = cfg.prompt_set_full if full else cfg.prompt_set
    prompts = load_prompt_set(_resolve_config(prompt_path))

    out = run_pipeline(
        eval_dir=eval_dir,
        models=models,
        prompts=prompts,
        cfg=cfg,
        run_id=run_id,
        resume=resume,
    )
    typer.echo(f"Done. Report at {out / 'report.md'}")


@app.command("metrics-only")
def metrics_only(
    run_id: str = typer.Option(..., help="existing run_id under results/"),
    config: str = typer.Option("config/eval_config.yaml"),
    models_path: str = typer.Option("config/models.json"),
    full: bool = typer.Option(False),
) -> None:
    """Recompute metrics on an existing run's images (no regeneration)."""
    eval_dir = _eval_dir()
    cfg = load_eval_config(_resolve_config(config))
    models = load_models_config(_resolve_config(models_path))
    prompt_path = cfg.prompt_set_full if full else cfg.prompt_set
    prompts = load_prompt_set(_resolve_config(prompt_path))
    run_dir = eval_dir / cfg.results_dir / run_id
    if not run_dir.exists():
        typer.echo(f"run_dir not found: {run_dir}", err=True)
        sys.exit(1)

    cells = build_cells(models, prompts, cfg.seeds_per_prompt)
    metrics_json, csv_rows, cells_index = compute_metrics(
        cells, models, prompts, cfg, eval_dir, run_dir
    )
    write_metrics_outputs(run_dir, metrics_json, csv_rows)
    render_report(run_dir, metrics_json, cfg, cells_index, models.target_size_px)
    typer.echo(f"Metrics + report regenerated at {run_dir / 'report.md'}")


@app.command("report-only")
def report_only(
    run_id: str = typer.Option(..., help="existing run_id under results/"),
    config: str = typer.Option("config/eval_config.yaml"),
    models_path: str = typer.Option("config/models.json"),
) -> None:
    """Re-render the report from an existing metrics.json (no metric recomputation)."""
    eval_dir = _eval_dir()
    cfg = load_eval_config(_resolve_config(config))
    models = load_models_config(_resolve_config(models_path))
    run_dir = eval_dir / cfg.results_dir / run_id
    metrics_path = run_dir / "metrics.json"
    if not metrics_path.exists():
        typer.echo(f"metrics.json not found at {metrics_path}", err=True)
        sys.exit(1)

    metrics_json = json.loads(metrics_path.read_text(encoding="utf-8"))
    cells_index = {
        cid: [{"prompt_id": pid_seed.split("_")[0],
               "seed_index": int(pid_seed.split("_")[1])} ]
        for cid in metrics_json.get("per_condition", {})
        for pid_seed in [p.stem for p in (run_dir / "snapped" / cid).glob("*.png")]
    } if (run_dir / "snapped").exists() else {}
    render_report(run_dir, metrics_json, cfg, cells_index, models.target_size_px)
    typer.echo(f"Report re-rendered at {run_dir / 'report.md'}")


if __name__ == "__main__":
    app()
