import { Response } from 'express';
import { z } from 'zod';
import QuestlineModel, { IQuestline } from '../models/questlineModel';
import { buildExportPayload } from '../services/questExport/buildExportPayload';
import { formats } from '../services/questExport/formats';
import { Format } from '../services/questExport/types';
import { QuestlineRequest } from '../middlewares/requireQuestlineOwnership';

const formatSchema = z.enum([
  'questflow-json',
  'questflow-yaml',
  'unity-asset',
  'unreal-datatable',
  'godot-tres',
]);

type NodeEdit       = { _ref: string; title?: string; body?: string; variant?: string; exportKey?: string };
type CharacterEdit  = { _ref: string; name?: string; appearance?: string; background?: string; exportKey?: string };
type RewardEdit     = { _ref: string; title?: string; description?: string; rarity?: string; exportKey?: string };
type ObjectiveEdit  = { _ref: string; title?: string; description?: string };

// GET /questlines/:id/edit-data
export async function getEditData(req: QuestlineRequest, res: Response): Promise<void> {
  const ql = req.questline!;
  res.json({
    meta: {
      title:       ql.title,
      description: ql.description ?? '',
      genre:       ql.genre ?? '',
    },
    nodes: ql.nodes.map((n) => ({
      _ref:      n._id.toString(),
      nodeId:    n.nodeId,
      title:     n.title,
      body:      n.body,
      variant:   n.variant,
      exportKey: n.exportKey ?? '',
    })),
    characters: ql.characters.map((c) => ({
      _ref:       c._id.toString(),
      name:       c.name,
      appearance: c.appearance ?? '',
      background: c.background ?? '',
      exportKey:  c.exportKey ?? '',
    })),
    rewards: ql.rewards.map((r) => ({
      _ref:        r._id.toString(),
      title:       r.title,
      description: r.description ?? '',
      rarity:      r.rarity,
      exportKey:   r.exportKey ?? '',
    })),
    objectives: ql.objectives.map((o) => ({
      _ref:        o._id.toString(),
      title:       o.title,
      description: o.description ?? '',
    })),
  });
}

function applyEdits(
  ql: IQuestline,
  body: {
    meta?:       { title?: string; description?: string; genre?: string };
    nodes?:      NodeEdit[];
    characters?: CharacterEdit[];
    rewards?:    RewardEdit[];
    objectives?: ObjectiveEdit[];
  },
): void {
  const { meta, nodes, characters, rewards, objectives } = body;

  if (meta?.title       != null) ql.title       = meta.title;
  if (meta?.description != null) ql.description = meta.description;
  if (meta?.genre       != null) ql.genre       = meta.genre;

  if (Array.isArray(nodes)) {
    for (const edit of nodes) {
      const n = ql.nodes.find((x) => x._id.toString() === edit._ref);
      if (!n) continue;
      if (edit.title     != null) n.title     = edit.title;
      if (edit.body      != null) n.body      = edit.body;
      if (edit.variant   != null) n.variant   = edit.variant;
      if (edit.exportKey != null) n.exportKey = edit.exportKey;
    }
  }

  if (Array.isArray(characters)) {
    for (const edit of characters) {
      const c = ql.characters.find((x) => x._id.toString() === edit._ref);
      if (!c) continue;
      if (edit.name       != null) c.name       = edit.name;
      if (edit.appearance != null) c.appearance = edit.appearance;
      if (edit.background != null) c.background = edit.background;
      if (edit.exportKey  != null) c.exportKey  = edit.exportKey;
    }
  }

  if (Array.isArray(rewards)) {
    for (const edit of rewards) {
      const r = ql.rewards.find((x) => x._id.toString() === edit._ref);
      if (!r) continue;
      if (edit.title       != null) r.title       = edit.title;
      if (edit.description != null) r.description = edit.description;
      if (edit.rarity      != null) r.rarity      = edit.rarity as 'common' | 'rare' | 'epic';
      if (edit.exportKey   != null) r.exportKey   = edit.exportKey;
    }
  }

  if (Array.isArray(objectives)) {
    for (const edit of objectives) {
      const o = ql.objectives.find((x) => x._id.toString() === edit._ref);
      if (!o) continue;
      if (edit.title       != null) o.title       = edit.title;
      if (edit.description != null) o.description = edit.description;
    }
  }
}

// POST /questlines/:id/render-preview
export async function renderPreview(req: QuestlineRequest, res: Response): Promise<void> {
  const { format: rawFormat, ...edits } = req.body as { format: unknown } & Parameters<typeof applyEdits>[1];

  const parsed = formatSchema.safeParse(rawFormat);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid format' });
    return;
  }
  const formatModule = formats[parsed.data as Format];

  try {
    // Mutate the in-memory document (never saved) so buildExportPayload sees the edits
    applyEdits(req.questline!, edits);
    const payload = buildExportPayload(req.questline!);
    const files   = formatModule.render(payload);
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Preview failed' });
  }
}

// PUT /questlines/:id/edit-data
export async function saveEditData(req: QuestlineRequest, res: Response): Promise<void> {
  const { meta, nodes, characters, rewards, objectives } = req.body as Parameters<typeof applyEdits>[1];

  try {
    const ql = await QuestlineModel.findById(req.params.id);
    if (!ql) { res.status(404).json({ error: 'Not found' }); return; }
    applyEdits(ql, { meta, nodes, characters, rewards, objectives });
    await ql.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Save failed' });
  }
}
