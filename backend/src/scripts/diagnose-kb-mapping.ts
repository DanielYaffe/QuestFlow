/**
 * Walk the whole KB-identity chain for one game and report where it breaks.
 *
 * The mapping feature spans four stores, and a failure in any one of them looks
 * identical from the UI ("the NPC ID is empty"). This script inspects each link
 * in order against the REAL data, so the broken one names itself:
 *
 *   1. KbDocument            — is the source text there, 'ready', and parsed as
 *                              entities (not freeform chunks)?
 *   2. parseCollectionFile   — does the parsed entity carry the id field?
 *   3. Qdrant payload        — did `fields` actually reach the vector store?
 *   4. loadExactKbEntity     — does the exact-name lookup the mapper uses return it?
 *   5. Character/Item docs   — did materialization persist customFields/maple.mapleId?
 *   6. TemplateKbMapping     — which mappings are validated, and what do they say?
 *   7. applyEntityMappings   — dry-run the mapper and print the values it produces.
 *
 * Read-only: nothing is written to Mongo or Qdrant. The fixes themselves live in
 * the create/edit path (materializeDesigns and applyEntityMappings); this only
 * tells you which link is broken.
 *
 * Run with:
 *   npx tsx src/scripts/diagnose-kb-mapping.ts                     # list games
 *   npx tsx src/scripts/diagnose-kb-mapping.ts --game=<gameId>
 *   npx tsx src/scripts/diagnose-kb-mapping.ts --game=<gameId> --entity="Tribal Leader"
 *   npx tsx src/scripts/diagnose-kb-mapping.ts --game=<gameId> --type=characters --limit=5
 */
import mongoose from 'mongoose';
import { config } from '../config/config';
import KbDocumentModel from '../models/kbDocumentModel';
import CharacterModel from '../models/characterModel';
import ItemModel from '../models/itemModel';
import TemplateKbMappingModel from '../models/templateKbMappingModel';
import ExportTemplateModel from '../models/exportTemplateModel';
import { ENTITY_ID_KEYS, parseCollectionFile, ParsedEntity } from '../services/structuredParse';
import { collectionName, isKbType, qdrant, KbType } from '../services/qdrant';
import {
  applyEntityMappings,
  loadExactKbEntity,
  loadMappedProjectEntities,
  TemplateMappingEntry,
} from '../services/templateEntityMappingService';

// --- CLI ---------------------------------------------------------------------

interface Options {
  gameId: string;
  type?: KbType;
  entity?: string;
  limit: number;
}

function parseArgs(argv: string[]): Options | null {
  const options: Options = { gameId: '', limit: 3 };
  for (const arg of argv) {
    if (arg.startsWith('--game=')) options.gameId = arg.slice('--game='.length).trim();
    else if (arg.startsWith('--entity=')) options.entity = arg.slice('--entity='.length).trim();
    else if (arg.startsWith('--limit=')) options.limit = Math.max(1, Number(arg.slice('--limit='.length)) || 3);
    else if (arg.startsWith('--type=')) {
      const value = arg.slice('--type='.length);
      if (!isKbType(value)) throw new Error(`Unknown --type: ${value}`);
      options.type = value;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options.gameId ? options : null;
}

/** Called when --game is missing: show what there is to point the script at. */
async function listGames(): Promise<void> {
  const grouped = await KbDocumentModel.aggregate<{
    _id: string;
    types: string[];
    docs: number;
    ready: number;
  }>([
    {
      $group: {
        _id: '$gameId',
        types: { $addToSet: '$type' },
        docs: { $sum: 1 },
        ready: { $sum: { $cond: [{ $eq: ['$status', 'ready'] }, 1, 0] } },
      },
    },
    { $sort: { docs: -1 } },
  ]);

  section('Games with knowledge-base documents');
  if (!grouped.length) {
    console.log(`${FAIL} no KbDocument rows exist at all.`);
    return;
  }
  for (const row of grouped) {
    console.log(`  --game=${row._id}   ${row.ready}/${row.docs} ready   types: ${row.types.sort().join(', ')}`);
  }
  console.log('\nRe-run with one of the --game values above.');
}

// --- helpers -----------------------------------------------------------------

const PASS = '  PASS';
const FAIL = '  FAIL';
const INFO = '      ';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function idFieldsOf(fields: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!fields) return {};
  return Object.fromEntries(ENTITY_ID_KEYS.flatMap((key) => (key in fields ? [[key, fields[key]]] : [])));
}

function preview(value: unknown, max = 240): string {
  const text = JSON.stringify(value) ?? String(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function section(title: string): void {
  console.log(`\n${'─'.repeat(72)}\n${title}\n${'─'.repeat(72)}`);
}

// --- 1–3. document, parser, vector payload -----------------------------------

interface EntityProbe {
  type: KbType;
  docId: string;
  docTitle: string;
  parsed: ParsedEntity;
  payloadFields?: Record<string, unknown>;
  payloadFound: boolean;
}

async function probeEntities(options: Options): Promise<EntityProbe[]> {
  section('1. KbDocuments in Mongo');

  const filter: Record<string, unknown> = { gameId: options.gameId };
  if (options.type) filter.type = options.type;
  const docs = await KbDocumentModel.find(filter).sort({ type: 1 }).lean();

  if (!docs.length) {
    console.log(`${FAIL} no KbDocument rows for game ${options.gameId}${options.type ? ` / type ${options.type}` : ''}.`);
    console.log(`${INFO} Nothing downstream can work. Upload the KB file for this game first.`);
    return [];
  }

  const probes: EntityProbe[] = [];
  for (const doc of docs) {
    const docId = String(doc._id);
    const entities = parseCollectionFile(doc.originalText);
    const structured = Boolean(entities?.length);
    const statusMark = doc.status === 'ready' ? PASS : FAIL;
    console.log(`${statusMark} ${doc.type.padEnd(11)} "${doc.title}" (${docId})`);
    console.log(`${INFO} status=${doc.status}${doc.statusError ? ` error="${doc.statusError}"` : ''} chunkCount=${doc.chunkCount}`);

    // 2. parser
    if (!structured) {
      console.log(`${FAIL} parseCollectionFile returned no entities — this document was ingested as FREEFORM text.`);
      console.log(`${INFO} Freeform points carry no "entity" and no "fields" payload, so exact-name lookup can never`);
      console.log(`${INFO} find it and no id can be mapped. Re-shape the file into one of the accepted collection`);
      console.log(`${INFO} shapes (array of objects with a name/title/id, name-keyed map, or "## Name" markdown).`);
      continue;
    }
    console.log(`${PASS} parseCollectionFile → ${entities!.length} entities`);

    const selected = options.entity
      ? entities!.filter((e) => e.name === options.entity)
      : entities!.slice(0, options.limit);
    if (options.entity && !selected.length) {
      console.log(`${INFO} (no entity named "${options.entity}" in this document)`);
      continue;
    }

    for (const parsed of selected) {
      const ids = idFieldsOf(parsed.fields);
      if (Object.keys(ids).length) {
        console.log(`${PASS} "${parsed.name}" parsed id fields: ${preview(ids)}`);
      } else {
        console.log(`${FAIL} "${parsed.name}" has NO recognized id field in parsed fields.`);
        console.log(`${INFO} keys present: ${preview(Object.keys(parsed.fields))}`);
        console.log(`${INFO} materialization only recognizes: ${ENTITY_ID_KEYS.join(', ')}`);
      }
      probes.push({ type: doc.type, docId, docTitle: doc.title, parsed, payloadFound: false });
    }
  }
  return probes;
}

async function probeQdrant(options: Options, probes: EntityProbe[]): Promise<void> {
  section('2. Qdrant payloads (did `fields` reach the vector store?)');
  if (!probes.length) {
    console.log(`${INFO} nothing to probe.`);
    return;
  }

  for (const probe of probes) {
    const collection = collectionName(options.gameId, probe.type);
    const result = await qdrant
      .scroll(collection, {
        filter: { must: [{ key: 'entity', match: { value: probe.parsed.name } }] },
        limit: 5,
        with_payload: true,
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`${FAIL} scroll ${collection} failed: ${message}`);
        return null;
      });

    const points = Array.isArray(result?.points) ? result.points : [];
    if (!points.length) {
      console.log(`${FAIL} "${probe.parsed.name}" — no point in ${collection} with payload.entity == that exact name.`);
      console.log(`${INFO} Either the document was never embedded (status not 'ready'), or it was embedded before`);
      console.log(`${INFO} the entity payload existed. Fix: npx tsx src/scripts/reembed-kb.ts --game=${options.gameId} --type=${probe.type}`);
      continue;
    }

    const payload = points[0].payload;
    const fields = isRecord(payload) && isRecord(payload.fields) ? payload.fields : undefined;
    if (!fields) {
      console.log(`${FAIL} "${probe.parsed.name}" — point exists but carries NO "fields" payload.`);
      console.log(`${INFO} payload keys: ${preview(isRecord(payload) ? Object.keys(payload) : payload)}`);
      console.log(`${INFO} These points predate structured ingestion. Re-embed this collection.`);
      continue;
    }

    probe.payloadFields = fields;
    probe.payloadFound = true;
    const ids = idFieldsOf(fields);
    if (Object.keys(ids).length) {
      console.log(`${PASS} "${probe.parsed.name}" payload fields id keys: ${preview(ids)} (docId=${isRecord(payload) ? payload.docId : '?'})`);
      continue;
    }
    // Not fatal any more — identity is read from the source document — but the
    // prompt's STRUCTURED KB CANDIDATES block is built from this payload, so the
    // model still sees an entity with no id and cannot ground unmapped fields.
    console.log(`${FAIL} "${probe.parsed.name}" payload has no id field, though the source document does.`);
    console.log(`${INFO} These vectors predate the current source text. Identity mapping is unaffected, but`);
    console.log(`${INFO} retrieval shows the model a stale sheet. Fix with:`);
    console.log(`${INFO}   npx tsx src/scripts/reembed-kb.ts --game=${options.gameId} --type=${probe.type} --recreate`);
    console.log(`${INFO} (--recreate also clears points orphaned by deleted documents)`);
  }
}

async function probeExactLookup(options: Options, probes: EntityProbe[]): Promise<void> {
  section('3. loadExactKbEntity (the lookup the mapper actually calls)');
  if (!probes.length) {
    console.log(`${INFO} nothing to probe.`);
    return;
  }

  for (const probe of probes) {
    const entity = await loadExactKbEntity(options.gameId, probe.type, probe.parsed.name);
    if (!entity) {
      console.log(`${FAIL} loadExactKbEntity(${probe.type}, "${probe.parsed.name}") → undefined`);
      if (probe.payloadFound) {
        // The payload is there, so the rejection came from the 'ready' doc gate.
        const ready = await KbDocumentModel.exists({
          _id: probe.docId,
          gameId: options.gameId,
          type: probe.type,
          status: 'ready',
        });
        console.log(`${INFO} point exists, so the readiness gate rejected it. KbDocument ${probe.docId}`);
        console.log(`${INFO} matches {gameId, type, status:'ready'}: ${Boolean(ready)}`);
        console.log(`${INFO} If false: the point's docId points at a document that is not 'ready' for this`);
        console.log(`${INFO} (gameId, type) — usually a stale point left by a failed or re-typed ingest.`);
      }
      continue;
    }
    const ids = idFieldsOf(entity.fields);
    const mark = Object.keys(ids).length ? PASS : FAIL;
    console.log(`${mark} loadExactKbEntity(${probe.type}, "${probe.parsed.name}") → id fields ${preview(ids)}`);
  }
}

// --- 4. persisted designs ----------------------------------------------------

async function probeDesigns(options: Options, probes: EntityProbe[]): Promise<void> {
  section('4. Studio designs materialized from these KB entities');

  const tags = probes.map((probe) => `${options.gameId}:${probe.parsed.name}`);
  const [characters, items] = await Promise.all([
    CharacterModel.find(tags.length ? { kbRef: { $in: tags } } : { kbRef: new RegExp(`^${options.gameId}:`) })
      .select('name kind projectId kbRef customFields maple.mapleId').lean(),
    ItemModel.find(tags.length ? { kbRef: { $in: tags } } : { kbRef: new RegExp(`^${options.gameId}:`) })
      .select('name projectId kbRef customFields maple.mapleId').lean(),
  ]);

  const linked = [
    ...characters.map((c) => ({ ...c, kind: String(c.kind) })),
    ...items.map((i) => ({ ...i, kind: 'item' })),
  ];

  if (!linked.length) {
    console.log(`${FAIL} no Character/Item in any project carries a kbRef for these entities.`);
    console.log(`${INFO} Nothing has been cast from the KB yet, so there is no design to read an id from.`);
    console.log(`${INFO} kbRef is only set when generation/AI-edit casts a KB entity (or backfills by name).`);
    const anyGrounded = await CharacterModel.countDocuments({ kbRef: { $ne: '' } });
    console.log(`${INFO} characters with ANY kbRef across all games: ${anyGrounded}`);
    return;
  }

  for (const design of linked) {
    const custom = isRecord(design.customFields) ? design.customFields : {};
    const ids = idFieldsOf(custom);
    const mapleId = design.maple?.mapleId ?? 0;
    const ok = Object.keys(ids).length > 0 || mapleId > 0;
    console.log(`${ok ? PASS : FAIL} ${design.kind.padEnd(7)} "${design.name}" (${String(design._id)}) project=${design.projectId}`);
    console.log(`${INFO} kbRef=${design.kbRef}`);
    console.log(`${INFO} customFields id keys: ${preview(ids)}`);
    console.log(`${INFO} maple.mapleId: ${mapleId}`);
    if (!ok) {
      console.log(`${INFO} This design was created before the KB fields were copied onto it, or exact lookup`);
      console.log(`${INFO} returned nothing at materialization time. Re-run KB ingest to trigger the backfill,`);
      console.log(`${INFO} or re-save the KB document (editDocument runs syncCharacterReferencesFromKb).`);
    }
    if (Object.keys(custom).length === 0) {
      console.log(`${INFO} NOTE: customFields is completely empty — the KB payload never reached this doc.`);
    }
  }
}

// --- 5–6. mappings and a dry run --------------------------------------------

async function probeMappings(options: Options, probes: EntityProbe[]): Promise<void> {
  section('5. Validated template↔KB mappings for this game');

  const mappingDocs = await TemplateKbMappingModel.find({ gameId: options.gameId }).lean();
  if (!mappingDocs.length) {
    console.log(`${FAIL} no TemplateKbMapping documents for game ${options.gameId}.`);
    console.log(`${INFO} Without a validated mapping, applyEntityMappings has nothing to apply.`);
    return;
  }

  for (const doc of mappingDocs) {
    const template = mongoose.isValidObjectId(doc.templateId)
      ? await ExportTemplateModel.findById(doc.templateId).select('name').lean()
      : null;
    const validated = doc.entries.filter((entry) => entry.status === 'validated');
    console.log(`\n  template "${template?.name ?? doc.templateId}" (${doc.templateId}) owner=${doc.ownerId}`);
    console.log(`  ${doc.entries.length} entr${doc.entries.length === 1 ? 'y' : 'ies'}, ${validated.length} validated`);
    if (!validated.length) {
      console.log(`${FAIL} none are validated — the mapper filters on status === 'validated' and will see zero.`);
    }
    for (const entry of doc.entries) {
      const mark = entry.status === 'validated' ? PASS : `  ${entry.status.slice(0, 4).toUpperCase()}`;
      console.log(`${mark} ${entry.templatePath}`);
      console.log(`${INFO} ← ${entry.kbType}.${entry.kbFieldPath}  valueType=${entry.valueType}  purpose="${entry.purpose}"`);
    }

    await dryRunMapper(options, probes, validated);
  }
}

async function dryRunMapper(
  options: Options,
  probes: EntityProbe[],
  validated: TemplateMappingEntry[],
): Promise<void> {
  if (!validated.length || !probes.length) return;
  section('6. applyEntityMappings dry run');

  const tags = probes.map((probe) => `${options.gameId}:${probe.parsed.name}`);
  const characters = await CharacterModel.find({ kbRef: { $in: tags } })
    .select('projectId ownerId').limit(1).lean();
  if (!characters.length) {
    console.log(`${INFO} no materialized design to run the mapper against — skipping.`);
    return;
  }
  const { ownerId, projectId } = characters[0];
  const designs = await CharacterModel.find({ projectId, kbRef: { $in: tags } }).select('_id').lean();
  const refIds = designs.map((d) => String(d._id));

  const entities = await loadMappedProjectEntities({
    ownerId,
    projectId,
    gameId: options.gameId,
    refIds,
  });
  console.log(`${INFO} normalized ${entities.length} entit${entities.length === 1 ? 'y' : 'ies'} for project ${projectId}`);
  for (const entity of entities) {
    console.log(`${INFO}   ${entity.refId} "${entity.name}" kbType=${entity.kbType}`);
    console.log(`${INFO}     projectFields id keys: ${preview(idFieldsOf(entity.projectFields))}`);
    console.log(`${INFO}     kbFields      id keys: ${preview(idFieldsOf(entity.kbFields))}`);
    if (!entity.kbFields) {
      console.log(`${INFO}     (kbFields undefined → exact KB lookup found nothing for kbRef="${entity.kbRef}")`);
    }
  }

  // Feed a single empty dialog page so a broadcast mapping has somewhere to land.
  const arrayPaths = [...new Set(
    validated
      .map((entry) => entry.templatePath.split('[].')[0])
      .filter((path, index, all) => validated[index].templatePath.includes('[].') && all.includes(path)),
  )];
  const seedValues: Record<string, unknown> = {};
  for (const path of arrayPaths) seedValues[path] = [{ id: 'page_1' }, { id: 'page_2' }, { id: 'page_3' }];

  const state = applyEntityMappings({
    values: seedValues,
    sources: {},
    mappings: validated,
    entities,
    refIds,
  });

  console.log(`\n${INFO} produced templateValues:`);
  for (const [path, value] of Object.entries(state.values)) {
    console.log(`${INFO}   ${path} = ${preview(value)}`);
  }
  if (!Object.keys(state.values).length) console.log(`${FAIL} the mapper produced NO values.`);
  for (const warning of state.warnings) console.log(`${INFO} warning: ${warning}`);
}

// --- main --------------------------------------------------------------------

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  await mongoose.connect(config.DATABASE_URL);
  if (!options) {
    await listGames();
    return;
  }
  console.log(`[diagnose] game   : ${options.gameId}`);
  console.log(`[diagnose] qdrant : ${config.QDRANT_URL}`);

  const probes = await probeEntities(options);
  await probeQdrant(options, probes);
  await probeExactLookup(options, probes);
  await probeDesigns(options, probes);
  await probeMappings(options, probes);

  console.log('\nThe first FAIL above is the link to fix — everything after it is a consequence.');
}

main()
  .then(async () => {
    await mongoose.disconnect();
  })
  .catch(async (err) => {
    console.error('[diagnose] failed:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
