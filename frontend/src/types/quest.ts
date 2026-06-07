export type NodeVariant = string;

export interface QuestExportFields {
  questId?: number;
  silent: boolean;
  preQuest: number[];
  daily: boolean;
  toKill: { id: number; amount: number }[];
  toCollect: { itemId: number; amount: number }[];
  rewardItems: { id: number; amount: number }[];
}

export type QuestNodeData = Record<string, unknown> & {
  title: string;
  body: string;
  variant?: NodeVariant;
  exportFields?: QuestExportFields;
  templateValues?: Record<string, unknown>;
  layoutDirection?: 'TB' | 'LR';
  npcIds?: string[];
  monsterIds?: string[];
  rewardIds?: string[];
  // Name lookup maps injected by QuestBuilder — id → display name
  characterNames?: Record<string, string>;
  rewardNames?: Record<string, string>;
  onAddPath?: (position: 'top' | 'bottom' | 'left' | 'right') => void;
  onDelete?: () => void;
  onChangeVariant?: (variant: NodeVariant) => void;
  onEdit?: () => void;
};

export type Quest = {
  id: number;
  name: string;
  description: string;
  requiredQuestId: number | null;
};
