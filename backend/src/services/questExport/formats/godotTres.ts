import { CanonicalExport, CanonicalNode, CanonicalCharacter, CanonicalReward, CanonicalObjective, ExportFile, FormatModule } from '../types';

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function gdStrArray(arr: string[]): string {
  if (arr.length === 0) return 'PackedStringArray()';
  return `PackedStringArray(${arr.map((s) => `"${s}"`).join(', ')})`;
}

function renderQuestTres(node: CanonicalNode): string {
  return [
    '[gd_resource type="Resource" script_class="QuestFlowQuest" load_steps=2 format=3]',
    '',
    '[ext_resource type="Script" path="res://addons/questflow/scripts/quest.gd" id="1"]',
    '',
    '[resource]',
    'script = ExtResource("1")',
    `id = "${node.id}"`,
    `variant = "${node.variant}"`,
    `title = "${esc(node.title)}"`,
    `body = "${esc(node.body)}"`,
    `npc_ids = ${gdStrArray(node.npcIds)}`,
    `monster_ids = ${gdStrArray(node.monsterIds)}`,
    `reward_ids = ${gdStrArray(node.rewardIds)}`,
    '',
  ].join('\n');
}

function renderCharacterTres(c: CanonicalCharacter): string {
  return [
    '[gd_resource type="Resource" script_class="QuestFlowCharacter" load_steps=2 format=3]',
    '',
    '[ext_resource type="Script" path="res://addons/questflow/scripts/character.gd" id="1"]',
    '',
    '[resource]',
    'script = ExtResource("1")',
    `id = "${c.id}"`,
    `character_name = "${esc(c.name)}"`,
    `appearance = "${esc(c.appearance)}"`,
    `background = "${esc(c.background)}"`,
    `image_url = "${c.imageUrl}"`,
    '',
  ].join('\n');
}

function renderRewardTres(r: CanonicalReward): string {
  const rarityMap = { common: 0, rare: 1, epic: 2 };
  return [
    '[gd_resource type="Resource" script_class="QuestFlowReward" load_steps=2 format=3]',
    '',
    '[ext_resource type="Script" path="res://addons/questflow/scripts/reward.gd" id="1"]',
    '',
    '[resource]',
    'script = ExtResource("1")',
    `id = "${r.id}"`,
    `title = "${esc(r.title)}"`,
    `description = "${esc(r.description)}"`,
    `rarity = ${rarityMap[r.rarity]}`,
    `image_url = "${r.imageUrl}"`,
    '',
  ].join('\n');
}

function renderObjectiveTres(o: CanonicalObjective): string {
  return [
    '[gd_resource type="Resource" script_class="QuestFlowObjective" load_steps=2 format=3]',
    '',
    '[ext_resource type="Script" path="res://addons/questflow/scripts/objective.gd" id="1"]',
    '',
    '[resource]',
    'script = ExtResource("1")',
    `id = "${o.id}"`,
    `title = "${esc(o.title)}"`,
    `description = "${esc(o.description)}"`,
    '',
  ].join('\n');
}

function renderQuestlineTres(payload: CanonicalExport): string {
  const loadSteps = payload.nodes.length + 2;
  const lines: string[] = [];

  lines.push(`[gd_resource type="Resource" script_class="QuestFlowQuestline" load_steps=${loadSteps} format=3]`);
  lines.push('');
  lines.push('[ext_resource type="Script" path="res://addons/questflow/scripts/questline.gd" id="1"]');

  payload.nodes.forEach((n, i) => {
    lines.push(`[ext_resource type="Resource" path="res://addons/questflow/quests/${n.id}.tres" id="${i + 2}"]`);
  });

  const edgeLines = payload.edges.map((e) =>
    `  {"id": "${e.id}", "source": "${e.source}", "target": "${e.target}"}`
  ).join(',\n');

  lines.push('');
  lines.push('[resource]');
  lines.push('script = ExtResource("1")');
  lines.push(`id = "${payload.meta.id}"`);
  lines.push(`title = "${esc(payload.meta.title)}"`);
  lines.push(`genre = "${payload.meta.genre}"`);
  lines.push(`description = "${esc(payload.meta.description)}"`);
  lines.push(`start_node_id = "${payload.meta.startNodeId}"`);
  lines.push(`quests = [${payload.nodes.map((_, i) => `ExtResource("${i + 2}")`).join(', ')}]`);
  lines.push(`edges = [${edgeLines ? '\n' + edgeLines + '\n]' : ']'}`);
  lines.push('');

  return lines.join('\n');
}

const QUEST_GD = `class_name QuestFlowQuest extends Resource

@export var id: String
@export var variant: String
@export var title: String
@export var body: String
@export var npc_ids: PackedStringArray
@export var monster_ids: PackedStringArray
@export var reward_ids: PackedStringArray
`;

const CHARACTER_GD = `class_name QuestFlowCharacter extends Resource

@export var id: String
@export var character_name: String
@export var appearance: String
@export var background: String
@export var image_url: String
`;

const REWARD_GD = `class_name QuestFlowReward extends Resource

## 0 = Common, 1 = Rare, 2 = Epic
@export var id: String
@export var title: String
@export var description: String
@export var rarity: int
@export var image_url: String
`;

const OBJECTIVE_GD = `class_name QuestFlowObjective extends Resource

@export var id: String
@export var title: String
@export var description: String
`;

const QUESTLINE_GD = `class_name QuestFlowQuestline extends Resource

@export var id: String
@export var title: String
@export var genre: String
@export var description: String
@export var start_node_id: String
@export var quests: Array[QuestFlowQuest]
@export var edges: Array[Dictionary]
`;

function readme(title: string): string {
  return `# QuestFlow Godot Export — ${title}

## Setup
1. Copy the \`scripts/\` folder to \`res://addons/questflow/scripts/\` in your project.
2. Copy \`questline.tres\` and the \`quests/\`, \`characters/\`, \`rewards/\` folders
   to \`res://addons/questflow/\`.
3. The scripts must be in place before loading the \`.tres\` files, or Godot
   will not find the class definitions.

## Files
| File | Description |
|---|---|
| questline.tres | Root resource with quest references and edges |
| quests/quest_N.tres | One resource per quest node |
| characters/npc_*.tres | Character resources |
| rewards/reward_*.tres | Reward resources |
| objectives/obj_*.tres | Objective resources |
| scripts/quest.gd | QuestFlowQuest class |
| scripts/character.gd | QuestFlowCharacter class |
| scripts/reward.gd | QuestFlowReward class |
| scripts/objective.gd | QuestFlowObjective class |
| scripts/questline.gd | QuestFlowQuestline class |

## Loading at runtime (GDScript)
\`\`\`gdscript
var questline: QuestFlowQuestline = load("res://addons/questflow/questline.tres")
var start_quest: QuestFlowQuest = questline.quests.filter(
    func(q): return q.id == questline.start_node_id
)[0]
\`\`\`

## Notes
- Rarity values: 0 = Common, 1 = Rare, 2 = Epic
`;
}

function render(payload: CanonicalExport): ExportFile[] {
  const files: ExportFile[] = [];

  files.push({ path: 'questline.tres', content: renderQuestlineTres(payload) });

  for (const node of payload.nodes) {
    files.push({ path: `quests/${node.id}.tres`,         content: renderQuestTres(node) });
  }
  for (const c of payload.characters) {
    files.push({ path: `characters/${c.id}.tres`,        content: renderCharacterTres(c) });
  }
  for (const r of payload.rewards) {
    files.push({ path: `rewards/${r.id}.tres`,           content: renderRewardTres(r) });
  }
  for (const o of payload.objectives) {
    files.push({ path: `objectives/${o.id}.tres`,        content: renderObjectiveTres(o) });
  }

  files.push({ path: 'scripts/quest.gd',       content: QUEST_GD });
  files.push({ path: 'scripts/character.gd',   content: CHARACTER_GD });
  files.push({ path: 'scripts/reward.gd',      content: REWARD_GD });
  files.push({ path: 'scripts/objective.gd',   content: OBJECTIVE_GD });
  files.push({ path: 'scripts/questline.gd',   content: QUESTLINE_GD });
  files.push({ path: 'README.md',              content: readme(payload.meta.title) });

  return files;
}

export default {
  id:        'godot-tres',
  label:     'Godot Resource (.tres)',
  extension: 'zip',
  mimeType:  'application/zip',
  render,
} as FormatModule;
