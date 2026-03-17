import { Request, Response } from 'express';
import NodeVariantConfigModel from '../models/nodeVariantConfigModel';

// GET /variant-configs — returns all variant configs (base + AI-created)
export async function getVariantConfigs(req: Request, res: Response) {
  try {
    const configs = await NodeVariantConfigModel.find().lean();
    res.json(configs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch variant configs' });
  }
}

// POST /variant-configs — create or upsert a variant config (used by AI generation)
export async function upsertVariantConfig(req: Request, res: Response) {
  const { key, label, iconKey, borderColor, bgColor, iconColor, shadowColor } = req.body as {
    key?: string;
    label?: string;
    iconKey?: string;
    borderColor?: string;
    bgColor?: string;
    iconColor?: string;
    shadowColor?: string;
  };

  if (!key || !label) {
    res.status(400).json({ error: 'key and label are required' });
    return;
  }

  try {
    const config = await NodeVariantConfigModel.findOneAndUpdate(
      { key },
      {
        $set: {
          label,
          iconKey:     iconKey     ?? 'star',
          borderColor: borderColor ?? 'border-zinc-500',
          bgColor:     bgColor     ?? 'bg-zinc-500/10',
          iconColor:   iconColor   ?? 'text-zinc-400',
          shadowColor: shadowColor ?? 'shadow-zinc-500/50',
        },
      },
      { upsert: true, new: true },
    );
    res.status(201).json(config);
  } catch (error) {
    res.status(500).json({ error: 'Failed to upsert variant config' });
  }
}
