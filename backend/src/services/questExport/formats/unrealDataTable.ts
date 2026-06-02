import { CanonicalExport, ExportFile, FormatModule } from '../types';

const QUEST_ROW_H = `#pragma once

#include "CoreMinimal.h"
#include "Engine/DataTable.h"
#include "QuestRow.generated.h"

UENUM(BlueprintType)
enum class EQuestRarity : uint8
{
    Common  UMETA(DisplayName = "Common"),
    Rare    UMETA(DisplayName = "Rare"),
    Epic    UMETA(DisplayName = "Epic"),
};

USTRUCT(BlueprintType)
struct FQuestRow : public FTableRowBase
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadOnly) FString Variant;
    UPROPERTY(EditAnywhere, BlueprintReadOnly) FString Title;
    UPROPERTY(EditAnywhere, BlueprintReadOnly) FString Body;
    UPROPERTY(EditAnywhere, BlueprintReadOnly) TArray<FString> NpcIds;
    UPROPERTY(EditAnywhere, BlueprintReadOnly) TArray<FString> MonsterIds;
    UPROPERTY(EditAnywhere, BlueprintReadOnly) TArray<FString> RewardIds;
};

USTRUCT(BlueprintType)
struct FCharacterRow : public FTableRowBase
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadOnly) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadOnly) FString Appearance;
    UPROPERTY(EditAnywhere, BlueprintReadOnly) FString Background;
    UPROPERTY(EditAnywhere, BlueprintReadOnly) FString ImageUrl;
};

USTRUCT(BlueprintType)
struct FRewardRow : public FTableRowBase
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadOnly) FString Title;
    UPROPERTY(EditAnywhere, BlueprintReadOnly) FString Description;
    UPROPERTY(EditAnywhere, BlueprintReadOnly) EQuestRarity Rarity;
    UPROPERTY(EditAnywhere, BlueprintReadOnly) FString ImageUrl;
};

USTRUCT(BlueprintType)
struct FObjectiveRow : public FTableRowBase
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadOnly) FString Title;
    UPROPERTY(EditAnywhere, BlueprintReadOnly) FString Description;
};
`;

function readme(title: string): string {
  return `# QuestFlow Unreal Export — ${title}

## Files
| File | Description |
|---|---|
| QuestTable.json | DataTable rows — one row per quest node |
| CharacterTable.json | DataTable rows — one row per character |
| RewardTable.json | DataTable rows — one row per reward |
| ObjectiveTable.json | DataTable rows — one row per objective |
| QuestlineMeta.json | Questline root: meta, edges, startNodeId |
| Source/QuestRow.h | USTRUCT definitions for all DataTables |

## Setup
1. Add \`QuestRow.h\` to your project's \`Source/<ProjectName>/\` folder.
2. In Unreal Editor: Content Browser → Import → select a \`.json\` file.
3. When prompted, choose the matching row struct:
   - QuestTable.json → FQuestRow
   - CharacterTable.json → FCharacterRow
   - RewardTable.json → FRewardRow
   - ObjectiveTable.json → FObjectiveRow

## Loading at runtime (C++)
\`\`\`cpp
UDataTable* QuestTable = LoadObject<UDataTable>(nullptr, TEXT("/Game/QuestFlow/QuestTable"));
FQuestRow* StartQuest = QuestTable->FindRow<FQuestRow>(FName(*StartNodeId), TEXT(""));
\`\`\`
`;
}

function render(payload: CanonicalExport): ExportFile[] {
  const files: ExportFile[] = [];

  // Quest rows — one per node
  const questRows = payload.nodes.map((n) => ({
    Name:       n.id,
    Variant:    n.variant,
    Title:      n.title,
    Body:       n.body,
    NpcIds:     n.npcIds,
    MonsterIds: n.monsterIds,
    RewardIds:  n.rewardIds,
  }));
  files.push({ path: 'QuestTable.json', content: JSON.stringify(questRows, null, 2) });

  // Character rows
  const charRows = payload.characters.map((c) => ({
    Name:       c.id,
    CharName:   c.name,
    Appearance: c.appearance,
    Background: c.background,
    ImageUrl:   c.imageUrl,
  }));
  files.push({ path: 'CharacterTable.json', content: JSON.stringify(charRows, null, 2) });

  // Reward rows
  const rarityMap: Record<string, string> = { common: 'Common', rare: 'Rare', epic: 'Epic' };
  const rewardRows = payload.rewards.map((r) => ({
    Name:        r.id,
    Title:       r.title,
    Description: r.description,
    Rarity:      rarityMap[r.rarity] ?? 'Common',
    ImageUrl:    r.imageUrl,
  }));
  files.push({ path: 'RewardTable.json', content: JSON.stringify(rewardRows, null, 2) });

  // Objective rows
  const objectiveRows = payload.objectives.map((o) => ({
    Name:        o.id,
    Title:       o.title,
    Description: o.description,
  }));
  files.push({ path: 'ObjectiveTable.json', content: JSON.stringify(objectiveRows, null, 2) });

  // Questline meta + graph
  files.push({
    path: 'QuestlineMeta.json',
    content: JSON.stringify({
      id:          payload.meta.id,
      title:       payload.meta.title,
      genre:       payload.meta.genre,
      description: payload.meta.description,
      startNodeId: payload.meta.startNodeId,
      edges:       payload.edges,
    }, null, 2),
  });

  files.push({ path: 'Source/QuestRow.h', content: QUEST_ROW_H });
  files.push({ path: 'README.md',         content: readme(payload.meta.title) });

  return files;
}

export default {
  id:        'unreal-datatable',
  label:     'Unreal DataTable (.json)',
  extension: 'zip',
  mimeType:  'application/zip',
  render,
} as FormatModule;
