import OpenAI from 'openai';
import { genProvider, embedProvider } from '../config/ai';

// ---------------------------------------------------------------------------
// Single swap point for ALL text generation + embeddings. Replaces the old
// per-file callGemini() helpers. Image generation (questStyleModel) stays on
// @google/genai — the OpenAI-compatible endpoint does not cover it.
// ---------------------------------------------------------------------------

const genClient = new OpenAI({ apiKey: genProvider.apiKey, baseURL: genProvider.baseURL });
const embedClient = new OpenAI({ apiKey: embedProvider.apiKey, baseURL: embedProvider.baseURL });

const stripFences = (s: string) =>
  s.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

/** Drop-in replacement for the old callGemini(prompt): single-turn, fences stripped. */
export async function complete(prompt: string): Promise<string> {
  const res = await genClient.chat.completions.create({
    model: genProvider.model,
    messages: [{ role: 'user', content: prompt }],
  });
  return stripFences(res.choices[0]?.message?.content ?? '');
}

export async function embed(text: string): Promise<number[]> {
  const res = await embedClient.embeddings.create({
    model: embedProvider.model,
    input: text,
    dimensions: embedProvider.dimensions,
  });
  return res.data[0].embedding;
}

// Gemini's OpenAI-compatible embeddings endpoint caps the batch size; stay
// under it and keep individual requests reasonably sized for any provider.
const EMBED_BATCH_SIZE = 100;

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const res = await embedClient.embeddings.create({
      model: embedProvider.model,
      input: batch,
      dimensions: embedProvider.dimensions,
    });
    // The API may return data out of order — sort by index before collecting.
    const sorted = [...res.data].sort((a, b) => a.index - b.index);
    vectors.push(...sorted.map((d) => d.embedding));
  }
  return vectors;
}
