import { GoogleGenAI } from '@google/genai';
import { config } from '../../../config/config';

const GEMINI_MODEL = 'gemini-2.5-flash-lite';

/**
 * Run a single-turn Gemini completion and strip any surrounding markdown code
 * fences from the result. Shared by quest generation and the character section
 * agents — Gemini is the only text model in QuestFlow.
 */
export async function callGemini(prompt: string): Promise<string> {
  const genAI = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
  const result = await genAI.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
  });
  const text = (result.text ?? '').trim();
  return text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
}
