import yaml from 'js-yaml';
import { CanonicalExport, ExportFile, FormatModule } from '../types';

const DUMP_OPTS = { noRefs: true, lineWidth: 120, quotingType: '"' } as const;

function readme(title: string): string {
  return `# QuestFlow YAML Export — ${title}

## Files
| File | Description |
|---|---|
| questline.yaml | Root file: meta, quest ID list, edges |
| quests/quest_N.yaml | One file per quest node |
| characters.yaml | Shared character definitions |
| rewards.yaml | Shared reward definitions |
| objectives.yaml | Questline objectives |

## Usage (Python example)
\`\`\`python
import yaml, os

with open('questline.yaml') as f:
    questline = yaml.safe_load(f)

quests = []
for quest_id in questline['questIds']:
    with open(f"quests/{quest_id}.yaml") as f:
        quests.append(yaml.safe_load(f))

start_quest = next(q for q in quests if q['id'] == questline['meta']['startNodeId'])
\`\`\`
`;
}

function render(payload: CanonicalExport): ExportFile[] {
  const files: ExportFile[] = [];

  files.push({
    path: 'questline.yaml',
    content: yaml.dump({
      meta:     payload.meta,
      questIds: payload.nodes.map((n) => n.id),
      edges:    payload.edges,
    }, DUMP_OPTS),
  });

  for (const node of payload.nodes) {
    files.push({ path: `quests/${node.id}.yaml`, content: yaml.dump(node, DUMP_OPTS) });
  }

  files.push({ path: 'characters.yaml', content: yaml.dump(payload.characters, DUMP_OPTS) });
  files.push({ path: 'rewards.yaml',    content: yaml.dump(payload.rewards,    DUMP_OPTS) });
  files.push({ path: 'objectives.yaml', content: yaml.dump(payload.objectives, DUMP_OPTS) });
  files.push({ path: 'README.md',       content: readme(payload.meta.title) });

  return files;
}

export default {
  id:        'questflow-yaml',
  label:     'QuestFlow YAML',
  extension: 'zip',
  mimeType:  'application/zip',
  render,
} as FormatModule;
