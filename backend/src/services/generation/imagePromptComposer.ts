import { Style, StyleLora, StyleSamplerParams, getStyle, getDefaultStyle } from '../../config/styles';

export const BACKGROUND_PHRASE = ', solid flat blue background';

export interface ComposedImagePrompt {
  positive: string;
  negative: string;
  checkpoint: string;
  loras: StyleLora[];
  sampler: StyleSamplerParams;
  dimensions: { width: number; height: number };
  targetSize?: number;
}

export function composeImagePrompt(opts: {
  styleId: string;
  userSubject: string;
  extraNegative?: string;
  dimensionsOverride?: { width: number; height: number };
}): ComposedImagePrompt {
  const style: Style = getStyle(opts.styleId) ?? getDefaultStyle();

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
    checkpoint: style.checkpoint,
    loras: style.loras,
    sampler: style.sampler,
    dimensions: opts.dimensionsOverride ?? style.defaultDimensions,
    targetSize: style.targetSize,
  };
}
