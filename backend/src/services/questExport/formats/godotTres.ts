import { FormatModule, CanonicalExport } from '../types';

// Godot text resource (.tres) format
// Uses Godot's plain-text resource serialization syntax
const godotTres: FormatModule = {
  id:        'godot-tres',
  label:     'Godot Resource (.tres)',
  extension: '.tres',
  mimeType:  'text/plain',
  render: (payload: CanonicalExport): string => {
    const lines: string[] = [];

    const totalSubResources =
      payload.nodes.length +
      payload.edges.length +
      payload.characters.length +
      payload.rewards.length +
      payload.objectives.length;

    lines.push(`[gd_resource type="Resource" load_steps=${totalSubResources + 1} format=3]`);
    lines.push('');

    let subId = 1;

    // ── Nodes ──────────────────────────────────────────────────────────────
    payload.nodes.forEach((n) => {
      lines.push(`[sub_resource type="Resource" id="${subId++}"]`);
      lines.push(`node_id = "${n.id}"`);
      lines.push(`variant = "${n.variant}"`);
      lines.push(`title = "${n.title.replace(/"/g, '\\"')}"`);
      lines.push(`body = "${n.body.replace(/"/g, '\\"')}"`);
      lines.push(`npc_ids = [${n.npcIds.map((id) => `"${id}"`).join(', ')}]`);
      lines.push(`monster_ids = [${n.monsterIds.map((id) => `"${id}"`).join(', ')}]`);
      lines.push(`reward_ids = [${n.rewardIds.map((id) => `"${id}"`).join(', ')}]`);
      lines.push('');
    });

    // ── Edges ──────────────────────────────────────────────────────────────
    payload.edges.forEach((e) => {
      lines.push(`[sub_resource type="Resource" id="${subId++}"]`);
      lines.push(`edge_id = "${e.id}"`);
      lines.push(`source = "${e.source}"`);
      lines.push(`target = "${e.target}"`);
      lines.push('');
    });

    // ── Characters ─────────────────────────────────────────────────────────
    payload.characters.forEach((c) => {
      lines.push(`[sub_resource type="Resource" id="${subId++}"]`);
      lines.push(`character_id = "${c.id}"`);
      lines.push(`name = "${c.name.replace(/"/g, '\\"')}"`);
      lines.push(`appearance = "${c.appearance.replace(/"/g, '\\"')}"`);
      lines.push(`background = "${c.background.replace(/"/g, '\\"')}"`);
      lines.push('');
    });

    // ── Rewards ────────────────────────────────────────────────────────────
    payload.rewards.forEach((r) => {
      lines.push(`[sub_resource type="Resource" id="${subId++}"]`);
      lines.push(`reward_id = "${r.id}"`);
      lines.push(`title = "${r.title.replace(/"/g, '\\"')}"`);
      lines.push(`description = "${r.description.replace(/"/g, '\\"')}"`);
      lines.push(`rarity = "${r.rarity}"`);
      lines.push('');
    });

    // ── Objectives ─────────────────────────────────────────────────────────
    payload.objectives.forEach((o) => {
      lines.push(`[sub_resource type="Resource" id="${subId++}"]`);
      lines.push(`objective_id = "${o.id}"`);
      lines.push(`title = "${o.title.replace(/"/g, '\\"')}"`);
      lines.push(`description = "${o.description.replace(/"/g, '\\"')}"`);
      lines.push('');
    });

    // ── Root resource ──────────────────────────────────────────────────────
    lines.push('[resource]');
    lines.push(`quest_id = "${payload.meta.id}"`);
    lines.push(`title = "${payload.meta.title.replace(/"/g, '\\"')}"`);
    lines.push(`genre = "${payload.meta.genre}"`);
    lines.push(`description = "${payload.meta.description.replace(/"/g, '\\"')}"`);

    const nodeRefs = payload.nodes.map((_, i) => `SubResource("${i + 1}")`).join(', ');
    lines.push(`nodes = [${nodeRefs}]`);

    const edgeStart = payload.nodes.length + 1;
    const edgeRefs = payload.edges.map((_, i) => `SubResource("${edgeStart + i}")`).join(', ');
    lines.push(`edges = [${edgeRefs}]`);

    const charStart = edgeStart + payload.edges.length;
    const charRefs = payload.characters.map((_, i) => `SubResource("${charStart + i}")`).join(', ');
    lines.push(`characters = [${charRefs}]`);

    const rewardStart = charStart + payload.characters.length;
    const rewardRefs = payload.rewards.map((_, i) => `SubResource("${rewardStart + i}")`).join(', ');
    lines.push(`rewards = [${rewardRefs}]`);

    const objStart = rewardStart + payload.rewards.length;
    const objRefs = payload.objectives.map((_, i) => `SubResource("${objStart + i}")`).join(', ');
    lines.push(`objectives = [${objRefs}]`);

    return lines.join('\n') + '\n';
  },
};

export default godotTres;
