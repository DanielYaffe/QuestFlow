// Phase-0 smoke test for the RAG stack: one embedding round-trip through the
// AI layer and a Qdrant connection check. Run with:
//   npx tsx src/scripts/ragSmokeTest.ts
// Prints no secrets — only dimensions, model names and collection counts.
import { embed } from '../services/ai';
import { qdrant } from '../services/qdrant';
import { embedProvider } from '../config/ai';
import { config } from '../config/config';

async function main(): Promise<void> {
  console.log(`Embedding model: ${embedProvider.model} (expecting ${embedProvider.dimensions} dims)`);
  const vector = await embed('A goblin chieftain guards the bridge at Thornford.');
  console.log(`embed() ok — got ${vector.length} dimensions`);
  if (vector.length !== embedProvider.dimensions) {
    throw new Error(
      `Dimension mismatch: provider returned ${vector.length} but EMBED_DIMENSIONS=${embedProvider.dimensions}. ` +
      'Fix EMBED_DIMENSIONS before ingesting anything — collections are created with that size.',
    );
  }

  console.log(`Qdrant: ${config.QDRANT_URL} (api key ${config.QDRANT_API_KEY ? 'set' : 'NOT set'})`);
  const { collections } = await qdrant.getCollections();
  console.log(`qdrant ok — ${collections.length} collection(s) visible`);

  console.log('Smoke test passed.');
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('Smoke test FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
