import { FormatModule, CanonicalExport, CanonicalNode, CanonicalEdge } from '../types';

// Unity ScriptableObject YAML format
// Compatible with JsonUtility and Unity's asset serialization pipeline
function renderUnityNode(node: CanonicalNode): object {
  return {
    NodeId:      node.id,
    Variant:     node.variant,
    Title:       node.title,
    Body:        node.body,
    NpcIds:      node.npcIds,
    MonsterIds:  node.monsterIds,
    RewardIds:   node.rewardIds,
  };
}

function renderUnityEdge(edge: CanonicalEdge): object {
  return {
    EdgeId: edge.id,
    Source: edge.source,
    Target: edge.target,
  };
}

const unityAsset: FormatModule = {
  id:        'unity-asset',
  label:     'Unity ScriptableObject (.asset)',
  extension: '.asset',
  mimeType:  'application/x-yaml',
  render: (payload: CanonicalExport): string => {
    const lines: string[] = [];

    lines.push('%YAML 1.1');
    lines.push('%TAG !u! tag:unity3d.com,2011:');
    lines.push('--- !u!114 &11400000');
    lines.push('MonoBehaviour:');
    lines.push('  m_ObjectHideFlags: 0');
    lines.push('  m_Script: {fileID: 11500000, guid: 00000000000000000000000000000000, type: 3}');
    lines.push(`  m_Name: ${payload.meta.title}`);
    lines.push('  questData:');
    lines.push(`    QuestId: "${payload.meta.id}"`);
    lines.push(`    Title: "${payload.meta.title}"`);
    lines.push(`    Genre: "${payload.meta.genre}"`);
    lines.push(`    Description: "${payload.meta.description.replace(/"/g, '\\"')}"`);

    lines.push('    Nodes:');
    payload.nodes.forEach((n) => {
      const u = renderUnityNode(n);
      lines.push(`    - NodeId: "${(u as Record<string,unknown>).NodeId}"`);
      lines.push(`      Variant: "${(u as Record<string,unknown>).Variant}"`);
      lines.push(`      Title: "${String((u as Record<string,unknown>).Title).replace(/"/g, '\\"')}"`);
      lines.push(`      Body: "${String((u as Record<string,unknown>).Body).replace(/"/g, '\\"')}"`);
      lines.push(`      NpcIds: [${n.npcIds.map((id) => `"${id}"`).join(', ')}]`);
      lines.push(`      MonsterIds: [${n.monsterIds.map((id) => `"${id}"`).join(', ')}]`);
      lines.push(`      RewardIds: [${n.rewardIds.map((id) => `"${id}"`).join(', ')}]`);
    });

    lines.push('    Edges:');
    payload.edges.forEach((e) => {
      const u = renderUnityEdge(e);
      lines.push(`    - EdgeId: "${(u as Record<string,unknown>).EdgeId}"`);
      lines.push(`      Source: "${(u as Record<string,unknown>).Source}"`);
      lines.push(`      Target: "${(u as Record<string,unknown>).Target}"`);
    });

    lines.push('    Characters:');
    payload.characters.forEach((c) => {
      lines.push(`    - Id: "${c.id}"`);
      lines.push(`      Name: "${c.name}"`);
      lines.push(`      Appearance: "${c.appearance.replace(/"/g, '\\"')}"`);
      lines.push(`      Background: "${c.background.replace(/"/g, '\\"')}"`);
    });

    lines.push('    Rewards:');
    payload.rewards.forEach((r) => {
      lines.push(`    - Id: "${r.id}"`);
      lines.push(`      Title: "${r.title}"`);
      lines.push(`      Description: "${r.description.replace(/"/g, '\\"')}"`);
      lines.push(`      Rarity: "${r.rarity}"`);
    });

    lines.push('    Objectives:');
    payload.objectives.forEach((o) => {
      lines.push(`    - Id: "${o.id}"`);
      lines.push(`      Title: "${o.title}"`);
      lines.push(`      Description: "${o.description.replace(/"/g, '\\"')}"`);
    });

    return lines.join('\n') + '\n';
  },
};

export default unityAsset;
