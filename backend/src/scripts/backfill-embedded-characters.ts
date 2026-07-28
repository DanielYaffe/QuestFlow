/**
 * Backfill: migrate legacy embedded `questline.characters[]` into the standalone
 * Character collection, then drop the embedded array.
 *
 * The unified Character collection is now the single source of truth — the
 * embedded `characters[]` field was removed from the Questline schema. This
 * script reads that legacy field via the raw MongoDB driver so it keeps working
 * after the schema change (Mongoose would otherwise strip the unknown field).
 *
 * For each questline that still has an embedded `characters[]` and no
 * `characterIds`:
 *   - create a Character doc (kind 'npc') per embedded entry
 *   - remap node npcIds/monsterIds from BOTH legacy reference forms — the AI temp
 *     id "char-N" (1-based index) and the embedded subdoc _id — to the new
 *     Character _id
 *   - set `characterIds` and `$unset` the embedded `characters[]`
 *
 * Idempotent: a questline is skipped once its `characterIds` is populated.
 *
 * Run with:  npx tsx src/scripts/backfill-embedded-characters.ts
 */
import mongoose from 'mongoose';
import { config } from '../config/config';
import CharacterModel from '../models/characterModel';
import { resolveProjectId } from '../models/projectModel';

interface LegacyEmbeddedCharacter {
  _id?: mongoose.Types.ObjectId;
  name?: string;
  appearance?: string;
  background?: string;
  imageUrl?: string;
}

interface LegacyNode {
  npcIds?: string[];
  monsterIds?: string[];
  [key: string]: unknown;
}

interface LegacyQuestlineDoc {
  _id: mongoose.Types.ObjectId;
  ownerId: unknown;
  projectId?: unknown;
  characters?: LegacyEmbeddedCharacter[];
  characterIds?: string[];
  nodes?: LegacyNode[];
}

async function backfill(): Promise<void> {
  await mongoose.connect(config.DATABASE_URL);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No database connection');
  console.log('[backfill] connected to', config.DATABASE_URL);

  const questlines = db.collection('questlines');
  const cursor = questlines.find({ characters: { $exists: true, $ne: [] } });

  let questlinesMigrated = 0;
  let charactersCreated = 0;

  for await (const raw of cursor) {
    const ql = raw as unknown as LegacyQuestlineDoc;

    // Idempotency: skip questlines already migrated.
    if (Array.isArray(ql.characterIds) && ql.characterIds.length > 0) continue;

    const embedded = ql.characters ?? [];
    if (embedded.length === 0) continue;

    const ownerId = String(ql.ownerId);
    const projectId = await resolveProjectId(
      ownerId,
      ql.projectId ? String(ql.projectId) : undefined,
    );

    // Map every legacy reference form -> new Character _id.
    const idMap = new Map<string, string>();
    const newIds: string[] = [];

    for (let i = 0; i < embedded.length; i++) {
      const c = embedded[i];
      const created = await CharacterModel.create({
        ownerId,
        projectId,
        kind: 'npc', // the embedded shape never stored a role
        name: c.name ?? `Character ${i + 1}`,
        appearance: c.appearance ?? '',
        lore: c.background ?? '',
        portraitUrl: c.imageUrl ?? '',
      });
      const newId = created._id.toString();
      newIds.push(newId);
      idMap.set(`char-${i + 1}`, newId);                // AI temp id (1-based index)
      if (c._id) idMap.set(c._id.toString(), newId);    // embedded subdoc _id
      charactersCreated++;
    }

    const remappedNodes = (ql.nodes ?? []).map((n) => ({
      ...n,
      npcIds: (n.npcIds ?? []).map((id) => idMap.get(id) ?? id),
      monsterIds: (n.monsterIds ?? []).map((id) => idMap.get(id) ?? id),
    }));

    await questlines.updateOne(
      { _id: ql._id },
      {
        $set: { characterIds: newIds, nodes: remappedNodes },
        $unset: { characters: '' },
      },
    );
    questlinesMigrated++;
  }

  console.log(`[backfill] questlines migrated : ${questlinesMigrated}`);
  console.log(`[backfill] characters created  : ${charactersCreated}`);

  await mongoose.disconnect();
  console.log('[backfill] done');
}

backfill().catch((err) => {
  console.error('[backfill] failed:', err);
  process.exit(1);
});
