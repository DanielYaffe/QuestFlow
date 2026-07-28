// ---------------------------------------------------------------------------
// Frame-loop playback for pixel-art animations: preloads frame images and
// drives a <canvas> with requestAnimationFrame at a given fps. Rendering is
// nearest-neighbor (imageSmoothingEnabled = false) so pixels stay crisp when
// the canvas is scaled up.
// ---------------------------------------------------------------------------

export function loadImages(urls: string[]): Promise<HTMLImageElement[]> {
  return Promise.all(
    urls.map(
      (url) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error(`Failed to load frame: ${url}`));
          img.src = url;
        }),
    ),
  );
}

export function drawFrame(canvas: HTMLCanvasElement, image: HTMLImageElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Fit the frame inside the canvas at the largest integer pixel scale
  // (falls back to fractional scale for very large frames).
  const scale = Math.max(
    1,
    Math.floor(Math.min(canvas.width / image.width, canvas.height / image.height)),
  );
  const fitScale = Math.min(canvas.width / image.width, canvas.height / image.height);
  const s = fitScale < 1 ? fitScale : scale;

  const w = Math.round(image.width * s);
  const h = Math.round(image.height * s);
  ctx.drawImage(image, Math.round((canvas.width - w) / 2), Math.round((canvas.height - h) / 2), w, h);
}

export interface FramePlayer {
  play(): void;
  pause(): void;
  /** Jump to a frame index and render it (pauses implicit — caller decides). */
  seek(index: number): void;
  setFps(fps: number): void;
  setLoop(loop: boolean): void;
  destroy(): void;
}

export function createFramePlayer(options: {
  canvas: HTMLCanvasElement;
  images: HTMLImageElement[];
  fps: number;
  loop: boolean;
  onFrame?: (index: number) => void;
  onEnded?: () => void;
}): FramePlayer {
  const { canvas, images, onFrame, onEnded } = options;
  let fps = options.fps;
  let loop = options.loop;
  let current = 0;
  let playing = false;
  let rafId = 0;
  let lastTick = 0;

  const render = () => {
    if (images[current]) {
      drawFrame(canvas, images[current]);
      onFrame?.(current);
    }
  };

  const tick = (time: number) => {
    if (!playing) return;
    if (time - lastTick >= 1000 / fps) {
      lastTick = time;
      const next = current + 1;
      if (next >= images.length) {
        if (loop) {
          current = 0;
        } else {
          playing = false;
          onEnded?.();
          return;
        }
      } else {
        current = next;
      }
      render();
    }
    rafId = requestAnimationFrame(tick);
  };

  render();

  return {
    play() {
      if (playing || images.length === 0) return;
      playing = true;
      lastTick = performance.now();
      rafId = requestAnimationFrame(tick);
    },
    pause() {
      playing = false;
      cancelAnimationFrame(rafId);
    },
    seek(index: number) {
      current = Math.min(images.length - 1, Math.max(0, index));
      render();
    },
    setFps(value: number) {
      fps = Math.min(30, Math.max(1, value));
    },
    setLoop(value: boolean) {
      loop = value;
    },
    destroy() {
      playing = false;
      cancelAnimationFrame(rafId);
    },
  };
}
