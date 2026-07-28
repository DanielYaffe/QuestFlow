import mongoose from 'mongoose';
import { buildExportPayload } from '../buildExportPayload';
import { CanonicalExport } from '../types';

// A fixed questline fixture — used by every snapshot test
export function makeFixture(): CanonicalExport {
  const charId1 = new mongoose.Types.ObjectId();
  const charId2 = new mongoose.Types.ObjectId();
  const rewardId1 = new mongoose.Types.ObjectId();
  const rewardId2 = new mongoose.Types.ObjectId();
  const chapterId = new mongoose.Types.ObjectId();

  const questline = {
    _id: new mongoose.Types.ObjectId(),
    title: "Dragon's Curse",
    description: 'A dark curse spreads across the kingdom.',
    genre: 'fantasy',
    storyPrompt: 'A dark curse spreads across the kingdom.',
    styleId: '',
    ownerId: new mongoose.Types.ObjectId().toString(),
    nodes: [
      {
        _id:        new mongoose.Types.ObjectId(),
        nodeId:     '1',
        type:       'questNode',
        title:      'The Awakening',
        body:       'A red glow erupts from the mountain.',
        variant:    'story',
        npcIds:     [charId1.toString()],
        monsterIds: [],
        rewardIds:  [],
      },
      {
        _id:        new mongoose.Types.ObjectId(),
        nodeId:     '2',
        type:       'questNode',
        title:      'Confront the Dragon',
        body:       'The beast emerges from the peak.',
        variant:    'combat',
        npcIds:     [],
        monsterIds: [charId2.toString()],
        rewardIds:  [rewardId1.toString()],
      },
      {
        _id:        new mongoose.Types.ObjectId(),
        nodeId:     '3',
        type:       'questNode',
        title:      'The Reward',
        body:       'The curse is lifted and peace returns.',
        variant:    'treasure',
        npcIds:     [],
        monsterIds: [],
        rewardIds:  [rewardId2.toString()],
      },
    ],
    edges: [
      { _id: new mongoose.Types.ObjectId(), edgeId: 'e1-2', source: '1', target: '2' },
      { _id: new mongoose.Types.ObjectId(), edgeId: 'e2-3', source: '2', target: '3' },
    ],
    characters: [
      {
        _id:        charId1,
        name:       'Taras the Elder',
        appearance: 'A tall man with a grey beard.',
        background: 'The village elder who knows of the curse.',
        imageUrl:   '',
        questIds:   [],
      },
      {
        _id:        charId2,
        name:       'Igrath the Dragon',
        appearance: 'A massive red dragon with burning eyes.',
        background: 'The source of the curse.',
        imageUrl:   '',
        questIds:   [],
      },
    ],
    rewards: [
      {
        _id:         rewardId1,
        title:       'Dragon Scale',
        description: 'A scale from the defeated dragon.',
        rarity:      'rare' as const,
        imageUrl:    '',
      },
      {
        _id:         rewardId2,
        title:       'Ancient Sword',
        description: 'A legendary blade.',
        rarity:      'epic' as const,
        imageUrl:    '',
      },
    ],
    objectives: [
      { _id: new mongoose.Types.ObjectId(), objectiveId: 'obj-1', title: 'Find the source', description: 'Locate the mountain.' },
      { _id: new mongoose.Types.ObjectId(), objectiveId: 'obj-2', title: 'Defeat the dragon', description: 'Slay Igrath.' },
    ],
    chapters: [
      {
        _id:    chapterId,
        title:  'Chapter One',
        scenes: [{ id: 'sc-1', title: 'The Village' }],
      },
    ],
    variants:  [],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  // Characters now live in the standalone Character collection; the caller
  // resolves them and passes them in (mirrors exportQuestline at runtime).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return buildExportPayload(
    questline as unknown as Parameters<typeof buildExportPayload>[0],
    questline.characters,
  );
}
