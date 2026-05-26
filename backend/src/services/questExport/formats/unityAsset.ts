import { CanonicalExport, CanonicalNode, CanonicalCharacter, CanonicalReward, CanonicalObjective, ExportFile, FormatModule } from '../types';

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function strList(ids: string[]): string {
  if (ids.length === 0) return '[]';
  return ids.map((id) => `\n      - "${id}"`).join('');
}

function renderQuestAsset(node: CanonicalNode): string {
  return [
    '%YAML 1.1',
    '%TAG !u! tag:unity3d.com,2011:',
    '--- !u!114 &11400000',
    'MonoBehaviour:',
    '  m_ObjectHideFlags: 0',
    '  m_Script: {fileID: 11500000, guid: 00000000000000000000000000000000, type: 3}',
    `  m_Name: ${node.id}`,
    '  questData:',
    `    Id: "${node.id}"`,
    `    Variant: "${node.variant}"`,
    `    Title: "${esc(node.title)}"`,
    `    Body: "${esc(node.body)}"`,
    `    NpcIds: ${strList(node.npcIds)}`,
    `    MonsterIds: ${strList(node.monsterIds)}`,
    `    RewardIds: ${strList(node.rewardIds)}`,
  ].join('\n') + '\n';
}

function renderCharacterAsset(c: CanonicalCharacter): string {
  return [
    '%YAML 1.1',
    '%TAG !u! tag:unity3d.com,2011:',
    '--- !u!114 &11400000',
    'MonoBehaviour:',
    '  m_ObjectHideFlags: 0',
    '  m_Script: {fileID: 11500000, guid: 00000000000000000000000000000000, type: 3}',
    `  m_Name: ${c.id}`,
    '  characterData:',
    `    Id: "${c.id}"`,
    `    Name: "${esc(c.name)}"`,
    `    Appearance: "${esc(c.appearance)}"`,
    `    Background: "${esc(c.background)}"`,
    `    ImageUrl: "${c.imageUrl}"`,
  ].join('\n') + '\n';
}

function renderRewardAsset(r: CanonicalReward): string {
  const rarityMap = { common: 0, rare: 1, epic: 2 };
  return [
    '%YAML 1.1',
    '%TAG !u! tag:unity3d.com,2011:',
    '--- !u!114 &11400000',
    'MonoBehaviour:',
    '  m_ObjectHideFlags: 0',
    '  m_Script: {fileID: 11500000, guid: 00000000000000000000000000000000, type: 3}',
    `  m_Name: ${r.id}`,
    '  rewardData:',
    `    Id: "${r.id}"`,
    `    Title: "${esc(r.title)}"`,
    `    Description: "${esc(r.description)}"`,
    `    Rarity: ${rarityMap[r.rarity]}`,
    `    ImageUrl: "${r.imageUrl}"`,
  ].join('\n') + '\n';
}

function renderObjectiveAsset(o: CanonicalObjective): string {
  return [
    '%YAML 1.1',
    '%TAG !u! tag:unity3d.com,2011:',
    '--- !u!114 &11400000',
    'MonoBehaviour:',
    '  m_ObjectHideFlags: 0',
    '  m_Script: {fileID: 11500000, guid: 00000000000000000000000000000000, type: 3}',
    `  m_Name: ${o.id}`,
    '  objectiveData:',
    `    Id: "${o.id}"`,
    `    Title: "${esc(o.title)}"`,
    `    Description: "${esc(o.description)}"`,
  ].join('\n') + '\n';
}

function renderQuestlineAsset(payload: CanonicalExport): string {
  const questRefs = payload.nodes.map((n) => `\n      - QuestId: "${n.id}"`).join('');
  const edgeRefs  = payload.edges.map((e) =>
    `\n      - EdgeId: "${e.id}"\n        Source: "${e.source}"\n        Target: "${e.target}"`
  ).join('');

  return [
    '%YAML 1.1',
    '%TAG !u! tag:unity3d.com,2011:',
    '--- !u!114 &11400000',
    'MonoBehaviour:',
    '  m_ObjectHideFlags: 0',
    '  m_Script: {fileID: 11500000, guid: 00000000000000000000000000000000, type: 3}',
    `  m_Name: ${payload.meta.id}`,
    '  questlineData:',
    `    Id: "${payload.meta.id}"`,
    `    Title: "${esc(payload.meta.title)}"`,
    `    Genre: "${payload.meta.genre}"`,
    `    Description: "${esc(payload.meta.description)}"`,
    `    StartNodeId: "${payload.meta.startNodeId}"`,
    `    QuestIds: ${questRefs || '[]'}`,
    `    Edges: ${edgeRefs || '[]'}`,
  ].join('\n') + '\n';
}

const QUEST_DATA_CS = `using UnityEngine;

namespace QuestFlow
{
    public enum Rarity { Common, Rare, Epic }

    [CreateAssetMenu(fileName = "NewQuest", menuName = "QuestFlow/Quest")]
    public class QuestData : ScriptableObject
    {
        public string Id;
        public string Variant;
        public string Title;
        [TextArea(3, 8)] public string Body;
        public string[] NpcIds;
        public string[] MonsterIds;
        public string[] RewardIds;
    }
}
`;

const CHARACTER_DATA_CS = `using UnityEngine;

namespace QuestFlow
{
    [CreateAssetMenu(fileName = "NewCharacter", menuName = "QuestFlow/Character")]
    public class CharacterData : ScriptableObject
    {
        public string Id;
        public string Name;
        [TextArea(2, 4)] public string Appearance;
        [TextArea(2, 4)] public string Background;
        public string ImageUrl;
    }
}
`;

const REWARD_DATA_CS = `using UnityEngine;

namespace QuestFlow
{
    [CreateAssetMenu(fileName = "NewReward", menuName = "QuestFlow/Reward")]
    public class RewardData : ScriptableObject
    {
        public string Id;
        public string Title;
        [TextArea(2, 4)] public string Description;
        public Rarity Rarity;
        public string ImageUrl;
    }
}
`;

const QUESTLINE_DATA_CS = `using UnityEngine;

namespace QuestFlow
{
    [System.Serializable]
    public struct QuestEdge
    {
        public string EdgeId;
        public string Source;
        public string Target;
    }

    [CreateAssetMenu(fileName = "NewQuestline", menuName = "QuestFlow/Questline")]
    public class QuestlineData : ScriptableObject
    {
        public string Id;
        public string Title;
        public string Genre;
        [TextArea(2, 4)] public string Description;
        public string StartNodeId;
        public string[] QuestIds;
        public QuestEdge[] Edges;
    }
}
`;

function readme(title: string): string {
  return `# QuestFlow Unity Export — ${title}

## Setup
1. Copy the \`Scripts/\` folder into your Unity project's \`Assets/\` folder.
2. Copy the \`Quests/\`, \`Characters/\`, \`Rewards/\`, and \`Questline.asset\` files
   into your Unity project (e.g. \`Assets/QuestFlow/\`).
3. In Unity, select each \`.asset\` file and assign the matching Script reference
   in the Inspector (QuestData, CharacterData, RewardData, QuestlineData).

## Scripts
| File | Description |
|---|---|
| QuestData.cs | ScriptableObject for a single quest node |
| CharacterData.cs | ScriptableObject for a character |
| RewardData.cs | ScriptableObject for a reward (includes Rarity enum) |
| QuestlineData.cs | ScriptableObject for the questline root + edges |

## Loading at runtime
\`\`\`csharp
var questline = Resources.Load<QuestlineData>("QuestFlow/Questline");
var startQuest = Resources.Load<QuestData>($"QuestFlow/Quests/{questline.StartNodeId}");
\`\`\`

## Notes
- Rarity values: 0 = Common, 1 = Rare, 2 = Epic
- NpcIds, MonsterIds, and RewardIds reference the Id field of the corresponding assets.
`;
}

function render(payload: CanonicalExport): ExportFile[] {
  const files: ExportFile[] = [];

  files.push({ path: 'Questline.asset', content: renderQuestlineAsset(payload) });

  for (const node of payload.nodes) {
    files.push({ path: `Quests/${node.id}.asset`,             content: renderQuestAsset(node) });
  }
  for (const c of payload.characters) {
    files.push({ path: `Characters/${c.id}.asset`,            content: renderCharacterAsset(c) });
  }
  for (const r of payload.rewards) {
    files.push({ path: `Rewards/${r.id}.asset`,               content: renderRewardAsset(r) });
  }
  for (const o of payload.objectives) {
    files.push({ path: `Objectives/${o.id}.asset`,            content: renderObjectiveAsset(o) });
  }

  files.push({ path: 'Scripts/QuestData.cs',      content: QUEST_DATA_CS });
  files.push({ path: 'Scripts/CharacterData.cs',  content: CHARACTER_DATA_CS });
  files.push({ path: 'Scripts/RewardData.cs',     content: REWARD_DATA_CS });
  files.push({ path: 'Scripts/QuestlineData.cs',  content: QUESTLINE_DATA_CS });
  files.push({ path: 'README.md',                 content: readme(payload.meta.title) });

  return files;
}

export default {
  id:        'unity-asset',
  label:     'Unity ScriptableObject (.asset)',
  extension: 'zip',
  mimeType:  'application/zip',
  render,
} as FormatModule;
