import { EngineFormatModule } from '../types';
import { adjacentNodeIds } from './engineHelpers';

// Unreal Engine DataTable JSON format — one DataTable file per quest node,
// with a single row keyed by the node's id (Unreal's "Name" row key).
const unrealDataTable: EngineFormatModule = {
  id:        'unreal-datatable',
  label:     'Unreal DataTable (.json)',
  extension: '.json',
  mimeType:  'application/json',
  renderNode: (node, payload) => {
    const { prev, next } = adjacentNodeIds(node, payload);
    const rows = [
      {
        Name:        node.id,
        NodeId:      node.id,
        Variant:     node.variant,
        Title:       node.title,
        Body:        node.body,
        NpcIds:      node.npcIds,
        MonsterIds:  node.monsterIds,
        RewardIds:   node.rewardIds,
        PrevNodeIds: prev,
        NextNodeIds: next,
      },
    ];

    return JSON.stringify(rows, null, 2);
  },
};

export default unrealDataTable;
