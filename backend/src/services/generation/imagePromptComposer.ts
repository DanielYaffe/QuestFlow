import { IStyleLora } from '../../models/spriteStyleModel';

export const BACKGROUND_PHRASE = ', solid flat blue background';

export interface ResolvedStyle {
  checkpointFilename: string;
  loras: IStyleLora[];
  promptPrefix: string;
  negativePrompt: string;
  defaultDimensions: { width: number; height: number };
  targetSize?: number;
  sampler: {
    steps: number;
    cfg: number;
    sampler: string;
    scheduler: string;
  };
}

export interface ComposedImagePrompt {
  positive: string;
  negative: string;
  checkpoint: string;
  loras: Array<{ filename: string; strength: number; strengthClip: number; triggerWord?: string }>;
  sampler: ResolvedStyle['sampler'];
  dimensions: { width: number; height: number };
  targetSize?: number;
}

export function composeImagePrompt(opts: {
  style: ResolvedStyle;
  userSubject: string;
  extraNegative?: string;
  dimensionsOverride?: { width: number; height: number };
}): ComposedImagePrompt {
  const { style } = opts;

  const triggers = style.loras
    .filter((l) => l.triggerWord)
    .map((l) => l.triggerWord)
    .join(', ');

  const prefixParts = [triggers, style.promptPrefix].filter(Boolean);
  const positive =
    [...prefixParts, opts.userSubject].join(' ').replace(/\s+/g, ' ').trimEnd() +
    BACKGROUND_PHRASE;

  const negative = opts.extraNegative
    ? `${style.negativePrompt}, ${opts.extraNegative}`
    : style.negativePrompt;

  return {
    positive,
    negative,
    checkpoint: style.checkpointFilename,
    loras: style.loras.map((l) => ({
      filename:     l.loraFilename,
      strength:     l.strength,
      strengthClip: l.strengthClip,
      triggerWord:  l.triggerWord,
    })),
    sampler:    style.sampler,
    dimensions: opts.dimensionsOverride ?? style.defaultDimensions,
    targetSize: style.targetSize,
  };
}