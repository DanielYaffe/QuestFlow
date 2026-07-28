/**
 * Migration: Projects + unified Character system (Plan V2, Phase 1.5).
 *
 *   1. Every questline without a projectId is moved into its owner's auto-created
 *      "Inbox" project (no data loss; existing UX keeps working).
 *   2. Standalone Monster docs are superseded by Character docs (kind: 'monster'),
 *      carrying speciesData across; the dropped battle/world/tres sprite keys are
 *      not migrated (exports are on-demand now).
 *
 * Migrating inline `questline.characters[]` into the Character collection now
 * lives in `backfill-embedded-characters.ts` (run that separately) — the embedded
 * field has been removed from the schema, so it must be read via the raw driver.
 *
 * Safe to re-run: monsters are skipped when a same-named monster Character already
 * exists for the owner.
 *
 * Run with:  npx tsx src/scripts/migrate-projects.ts
 */
import mongoose from 'mongoose';
import { config } from '../config/config';
import QuestlineModel from '../models/questlineModel';
import CharacterModel from '../models/characterModel';
import MonsterModel from '../models/monsterModel';
import { ensureInboxProject } from '../models/projectModel';

async function migrate(): Promise<void> {
  await mongoose.connect(config.DATABASE_URL);
  console.log('[migrate] connected to', config.DATABASE_URL);

  const inboxCache = new Map<string, string>(); // ownerId -> inbox project _id
  const getInbox = async (ownerId: string): Promise<string> => {
    const cached = inboxCache.get(ownerId);
    if (cached) return cached;
    const inbox = await ensureInboxProject(ownerId);
    const id = inbox._id.toString();
    inboxCache.set(ownerId, id);
    return id;
  };

  let qlProjectAssigned = 0;
  let monsterMigrated = 0;

  // ── 1. Questlines: assign a project to any that lack one ───────────────────
  const questlines = await QuestlineModel.find({});
  for (const ql of questlines) {
    if (!ql.projectId) {
      ql.projectId = await getInbox(ql.ownerId);
      qlProjectAssigned++;
      await ql.save();
    }
  }

  // ── 2. Standalone monsters -> Character(kind: 'monster') ───────────────────
  const monsters = await MonsterModel.find({}).lean();
  for (const m of monsters) {
    const already = await CharacterModel.exists({ ownerId: m.ownerId, kind: 'monster', name: m.name });
    if (already) continue;

    let projectId = '';
    if (m.questlineId) {
      const ql = await QuestlineModel.findById(m.questlineId).select('projectId').lean();
      projectId = ql?.projectId ?? '';
    }
    if (!projectId) projectId = await getInbox(m.ownerId);

    await CharacterModel.create({
      ownerId: m.ownerId,
      projectId,
      kind: 'monster',
      name: m.name,
      lore: m.description ?? '',
      portraitUrl: m.assets?.portraitKey ?? '',
      speciesData: m.speciesData,
    });
    monsterMigrated++;
  }

  console.log(`[migrate] questlines given a projectId : ${qlProjectAssigned}`);
  console.log(`[migrate] standalone monsters migrated : ${monsterMigrated}`);

  await mongoose.disconnect();
  console.log('[migrate] done');
}

migrate().catch((err) => {
  console.error('[migrate] failed:', err);
  process.exit(1);
});
