import { CanonicalExport, CanonicalNode, ExportFile } from './types';
import { IBindingRule } from '../../models/customFormatModel';

export interface CustomFormatSpec {
  name: string;
  extension: string;
  fileNamePattern: string;
  example: unknown;
  bindings: Record<string, IBindingRule>;
}

/** Per-quest data exposed to the template. */
export interface QuestContext {
  id: string;
  nodeId: string;
  title: string;
  variant: string;
  body: string;
  monsters: string[];
  rewards: string[];
  npcs: string[];
  prevQuestIds: string[];
  questline: { id: string; title: string; genre: string; description: string };
  item?: unknown; // set inside a `repeat` block
}

// ── Field resolution ────────────────────────────────────────────────────────

function resolveField(ctx: QuestContext, field?: string): unknown {
  if (!field) return null;
  if (field.startsWith('questline.')) {
    const key = field.slice('questline.'.length) as keyof QuestContext['questline'];
    return ctx.questline[key] ?? null;
  }
  return (ctx as unknown as Record<string, unknown>)[field] ?? null;
}

function resolveItemField(item: unknown, field?: string): unknown {
  if (item && typeof item === 'object' && field) {
    return (item as Record<string, unknown>)[field] ?? null;
  }
  return item;
}

// ── Template walk ─────────────────────────────────────────────────────────────
// Walks the pasted `example` value, applying binding rules keyed by JSON path,
// and returns a real JS value. Arrays use a "[]" path segment for their element.

function walk(
  value: unknown,
  path: string,
  ctx: QuestContext,
  bindings: Record<string, IBindingRule>,
): unknown {
  const rule = bindings[path];

  if (rule?.type === 'field')      return resolveField(ctx, rule.field);
  if (rule?.type === 'item')       return ctx.item ?? null;
  if (rule?.type === 'item-field') return resolveItemField(ctx.item, rule.field);

  if (rule?.type === 'repeat' && Array.isArray(value)) {
    const collection = resolveField(ctx, rule.over);
    if (!Array.isArray(collection)) return [];
    const itemTemplate = value.length ? value[0] : null;
    const itemPath = `${path}[]`;
    return collection.map((el) => walk(itemTemplate, itemPath, { ...ctx, item: el }, bindings));
  }

  if (Array.isArray(value)) {
    return value.map((el) => walk(el, `${path}[]`, ctx, bindings));
  }

  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>)) {
      const childPath = path ? `${path}.${k}` : k;
      out[k] = walk((value as Record<string, unknown>)[k], childPath, ctx, bindings);
    }
    return out;
  }

  return value; // constant
}

// ── Filename pattern ({{token}} → ctx field) ───────────────────────────────────

function renderFileName(pattern: string, ctx: QuestContext): string {
  const rendered = pattern.replace(/{{\s*([\w.]+)\s*}}/g, (_m, token: string) => {
    const v = resolveField(ctx, token);
    return v == null ? '' : String(v);
  });
  // Strip path separators so the name can't escape the zip folder.
  return rendered.replace(/[\\/]+/g, '_') || 'quest';
}

// ── Context builder ─────────────────────────────────────────────────────────

export function buildNodeContext(payload: CanonicalExport, node: CanonicalNode): QuestContext {
  const prevQuestIds = payload.edges
    .filter((e) => e.target === node.id)
    .map((e) => e.source);

  return {
    id:           node.id,
    nodeId:       node.id.replace(/^quest_/, ''),
    title:        node.title,
    variant:      node.variant,
    body:         node.body,
    monsters:     node.monsterIds,
    rewards:      node.rewardIds,
    npcs:         node.npcIds,
    prevQuestIds,
    questline: {
      id:          payload.meta.id,
      title:       payload.meta.title,
      genre:       payload.meta.genre,
      description: payload.meta.description,
    },
  };
}

/** A synthetic quest used for the wizard/editor live preview (no real quests yet). */
export function sampleContext(): QuestContext {
  return {
    id:       'quest_1',
    nodeId:   '1',
    title:    'A Shadow Over Oakhaven',
    variant:  'story',
    body:     'The village of Oakhaven is threatened by a dragon. Save it.',
    monsters: ['monster_dragon', 'monster_goblin'],
    rewards:  ['reward_gold', 'reward_sword'],
    npcs:     ['npc_elder', 'npc_blacksmith'],
    prevQuestIds: [],
    questline: { id: 'sample-questline', title: 'Sample Questline', genre: 'Fantasy', description: 'A sample.' },
  };
}

export function renderOne(spec: CustomFormatSpec, ctx: QuestContext): { fileName: string; content: string } {
  const value   = walk(spec.example, '', ctx, spec.bindings ?? {});
  const ext     = (spec.extension || 'json').replace(/^\.+/, '');
  const fileName = `${renderFileName(spec.fileNamePattern || '{{id}}', ctx)}.${ext}`;
  return { fileName, content: JSON.stringify(value, null, 2) };
}

// ── Main entry: one file per quest node ────────────────────────────────────────

export function renderCustomFormat(payload: CanonicalExport, spec: CustomFormatSpec): ExportFile[] {
  const files: ExportFile[] = [];

  for (const node of payload.nodes) {
    const ctx = buildNodeContext(payload, node);
    const { fileName, content } = renderOne(spec, ctx);
    files.push({ path: fileName, content });
  }

  files.push({
    path: 'README.md',
    content: `# ${spec.name} — custom export\n\nGenerated by QuestFlow. One \`.${(spec.extension || 'json').replace(/^\.+/, '')}\` file per quest.\n`,
  });

  return files;
}
