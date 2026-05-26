"""Minimal ComfyUI HTTP client. Mirrors the three endpoints used by generationService.ts."""
from __future__ import annotations

import time
from dataclasses import dataclass

import requests
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential


@dataclass
class ComfyImageRef:
    filename: str
    subfolder: str
    type: str


class ComfyClient:
    def __init__(self, endpoint: str, poll_interval_s: float = 1.5, timeout_s: float = 180.0):
        self.endpoint = endpoint.rstrip("/")
        self.poll_interval_s = poll_interval_s
        self.timeout_s = timeout_s
        self._session = requests.Session()

    @retry(
        retry=retry_if_exception_type(requests.RequestException),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=5),
        stop=stop_after_attempt(3),
        reraise=True,
    )
    def system_stats(self) -> dict:
        r = self._session.get(f"{self.endpoint}/system_stats", timeout=10)
        r.raise_for_status()
        return r.json()

    @retry(
        retry=retry_if_exception_type(requests.RequestException),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=5),
        stop=stop_after_attempt(3),
        reraise=True,
    )
    def object_info(self) -> dict:
        r = self._session.get(f"{self.endpoint}/object_info", timeout=30)
        r.raise_for_status()
        return r.json()

    @retry(
        retry=retry_if_exception_type(requests.RequestException),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=5),
        stop=stop_after_attempt(3),
        reraise=True,
    )
    def submit_prompt(self, workflow: dict) -> str:
        r = self._session.post(
            f"{self.endpoint}/prompt",
            json={"prompt": workflow},
            timeout=30,
        )
        r.raise_for_status()
        return r.json()["prompt_id"]

    def wait_for_history(self, prompt_id: str) -> ComfyImageRef:
        deadline = time.monotonic() + self.timeout_s
        while time.monotonic() < deadline:
            time.sleep(self.poll_interval_s)
            try:
                r = self._session.get(f"{self.endpoint}/history/{prompt_id}", timeout=10)
            except requests.RequestException:
                continue
            if not r.ok:
                continue
            history = r.json()
            entry = history.get(prompt_id)
            if not entry:
                continue
            status = entry.get("status", {})
            if not status.get("completed"):
                continue
            for node_output in entry.get("outputs", {}).values():
                images = node_output.get("images") or []
                if not images:
                    continue
                img = images[0]
                return ComfyImageRef(
                    filename=img["filename"],
                    subfolder=img.get("subfolder", ""),
                    type=img.get("type", "output"),
                )
            raise RuntimeError(f"ComfyUI prompt {prompt_id} completed without an image output")
        raise TimeoutError(f"ComfyUI prompt {prompt_id} timed out after {self.timeout_s}s")

    @retry(
        retry=retry_if_exception_type(requests.RequestException),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=5),
        stop=stop_after_attempt(3),
        reraise=True,
    )
    def fetch_image(self, ref: ComfyImageRef) -> bytes:
        r = self._session.get(
            f"{self.endpoint}/view",
            params={"filename": ref.filename, "subfolder": ref.subfolder, "type": ref.type},
            timeout=30,
        )
        r.raise_for_status()
        return r.content
