export interface CanonicalMeta {
  id: string;
  title: string;
  genre: string;
  description: string;
}

export interface CanonicalNode {
  id: string;
  variant: string;
  title: string;
  body: string;
  npcIds: string[];
  monsterIds: string[];
  rewardIds: string[];
  templateValues?: Record<string, unknown>;
  exportFields?: {
    questId?: number;
    silent: boolean;
    preQuest: number[];
    daily: boolean;
    toKill: { id: number; amount: number }[];
    toCollect: { itemId: number; amount: number }[];
    rewardItems: { id: number; amount: number }[];
  };
}

export interface CanonicalEdge {
  id: string;
  source: string;
  target: string;
}

export interface CanonicalCharacter {
  id: string;
  name: string;
  appearance: string;
  background: string;
}

export interface CanonicalReward {
  id: string;
  title: string;
  description: string;
  rarity: 'common' | 'rare' | 'epic';
}

export interface CanonicalObjective {
  id: string;
  title: string;
  description: string;
}

export interface CanonicalChapter {
  id: string;
  title: string;
  scenes: { id: string; title: string }[];
}

export interface CanonicalExport {
  meta: CanonicalMeta;
  nodes: CanonicalNode[];
  edges: CanonicalEdge[];
  characters: CanonicalCharacter[];
  rewards: CanonicalReward[];
  objectives: CanonicalObjective[];
  chapters: CanonicalChapter[];
}

export type Format =
  | 'questflow-json'
  | 'questflow-yaml'
  | 'template-json'
  | 'template-yaml'
  | 'template-xml';

export interface FormatModule {
  id: Format;
  label: string;
  extension: string;
  mimeType: string;
  render: (payload: CanonicalExport) => string;
}

export interface ExportResult {
  filename: string;
  content: string;
  mimeType: string;
  files?: ExportFile[];
}

export interface ExportFile {
  filename: string;
  content: string;
  mimeType: string;
}
