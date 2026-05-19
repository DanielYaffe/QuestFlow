import { FormatModule, CanonicalExport } from '../types';

// Unreal Engine DataTable JSON format
// Each row has a "Name" field (the row key) plus the quest data fields
const unrealDataTable: FormatModule = {
  id:        'unreal-datatable',
  label:     'Unreal DataTable (.json)',
  extension: '.json',
  mimeType:  'application/json',
  render: (payload: CanonicalExport): string => {
    const rows = [
      {
        Name:        payload.meta.id,
        QuestId:     payload.meta.id,
        Title:       payload.meta.title,
        Genre:       payload.meta.genre,
        Description: payload.meta.description,
        Nodes: payload.nodes.map((n) => ({
          NodeId:     n.id,
          Variant:    n.variant,
          Title:      n.title,
          Body:       n.body,
          NpcIds:     n.npcIds,
          MonsterIds: n.monsterIds,
          RewardIds:  n.rewardIds,
        })),
        Edges: payload.edges.map((e) => ({
          EdgeId: e.id,
          Source: e.source,
          Target: e.target,
        })),
        Characters: payload.characters.map((c) => ({
          Id:         c.id,
          Name:       c.name,
          Appearance: c.appearance,
          Background: c.background,
        })),
        Rewards: payload.rewards.map((r) => ({
          Id:          r.id,
          Title:       r.title,
          Description: r.description,
          Rarity:      r.rarity,
        })),
        Objectives: payload.objectives.map((o) => ({
          Id:          o.id,
          Title:       o.title,
          Description: o.description,
        })),
      },
    ];

    return JSON.stringify(rows, null, 2);
  },
};

export default unrealDataTable;
