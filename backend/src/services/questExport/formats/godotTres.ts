import { EngineFormatModule } from '../types';
import { adjacentNodeIds } from './engineHelpers';

// Godot text resource (.tres) format — one Resource file per quest node,
// using Godot's plain-text resource serialization syntax.
const godotTres: EngineFormatModule = {
  id:        'godot-tres',
  label:     'Godot Resource (.tres)',
  extension: '.tres',
  mimeType:  'text/plain',
  renderNode: (node, payload) => {
    const { prev, next } = adjacentNodeIds(node, payload);
    const lines: string[] = [];

    lines.push('[gd_resource type="Resource" format=3]');
    lines.push('');
    lines.push('[resource]');
    lines.push(`node_id = "${node.id}"`);
    lines.push(`variant = "${node.variant}"`);
    lines.push(`title = "${node.title.replace(/"/g, '\\"')}"`);
    lines.push(`body = "${node.body.replace(/"/g, '\\"')}"`);
    lines.push(`npc_ids = [${node.npcIds.map((id) => `"${id}"`).join(', ')}]`);
    lines.push(`monster_ids = [${node.monsterIds.map((id) => `"${id}"`).join(', ')}]`);
    lines.push(`reward_ids = [${node.rewardIds.map((id) => `"${id}"`).join(', ')}]`);
    lines.push(`prev_node_ids = [${prev.map((id) => `"${id}"`).join(', ')}]`);
    lines.push(`next_node_ids = [${next.map((id) => `"${id}"`).join(', ')}]`);

    return lines.join('\n') + '\n';
  },
};

export default godotTres;
