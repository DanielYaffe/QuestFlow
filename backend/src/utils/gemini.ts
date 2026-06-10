import { GoogleGenAI } from '@google/genai';
import { config } from '../config/config';

export async function callGemini(prompt: string): Promise<string> {
  const genAI = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
  const result = await genAI.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: prompt,
  });
  const text = (result.text ?? '').trim();
  return text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
}
