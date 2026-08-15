import { EngineFormatModule } from '../types';
import { adjacentNodeIds } from './engineHelpers';

// Unity ScriptableObject YAML format — one .asset file per quest node.
// Compatible with JsonUtility and Unity's asset serialization pipeline.
const unityAsset: EngineFormatModule = {
  id:        'unity-asset',
  label:     'Unity ScriptableObject (.asset)',
  extension: '.asset',
  mimeType:  'application/x-yaml',
  renderNode: (node, payload) => {
    const { prev, next } = adjacentNodeIds(node, payload);
    const lines: string[] = [];

    lines.push('%YAML 1.1');
    lines.push('%TAG !u! tag:unity3d.com,2011:');
    lines.push('--- !u!114 &11400000');
    lines.push('MonoBehaviour:');
    lines.push('  m_ObjectHideFlags: 0');
    lines.push('  m_Script: {fileID: 11500000, guid: 00000000000000000000000000000000, type: 3}');
    lines.push(`  m_Name: ${node.title}`);
    lines.push('  questNode:');
    lines.push(`    NodeId: "${node.id}"`);
    lines.push(`    Variant: "${node.variant}"`);
    lines.push(`    Title: "${node.title.replace(/"/g, '\\"')}"`);
    lines.push(`    Body: "${node.body.replace(/"/g, '\\"')}"`);
    lines.push(`    NpcIds: [${node.npcIds.map((id) => `"${id}"`).join(', ')}]`);
    lines.push(`    MonsterIds: [${node.monsterIds.map((id) => `"${id}"`).join(', ')}]`);
    lines.push(`    RewardIds: [${node.rewardIds.map((id) => `"${id}"`).join(', ')}]`);
    lines.push(`    PrevNodeIds: [${prev.map((id) => `"${id}"`).join(', ')}]`);
    lines.push(`    NextNodeIds: [${next.map((id) => `"${id}"`).join(', ')}]`);

    return lines.join('\n') + '\n';
  },
};

export default unityAsset;
