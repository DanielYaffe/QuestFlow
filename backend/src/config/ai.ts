import { config } from './config';

// ---------------------------------------------------------------------------
// AI provider configuration. Generation is swappable via AI_PROVIDER + GEN_MODEL;
// embeddings are PINNED (model + dimensions must never change after ingesting —
// every stored vector in Qdrant depends on them).
// ---------------------------------------------------------------------------

export interface ProviderConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

// Default keeps Gemini (existing key + model) through its OpenAI-compatible
// endpoint, so day-one behavior is unchanged while the SDK becomes swappable.
const GEN_PROVIDERS: Record<string, ProviderConfig> = {
  gemini:    { baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/', apiKey: config.GEMINI_API_KEY,    model: config.GEN_MODEL },
  openai:    { baseURL: 'https://api.openai.com/v1',                                apiKey: config.OPENAI_API_KEY,    model: config.GEN_MODEL },
  anthropic: { baseURL: 'https://api.anthropic.com/v1/',                            apiKey: config.ANTHROPIC_API_KEY, model: config.GEN_MODEL },
  groq:      { baseURL: 'https://api.groq.com/openai/v1',                           apiKey: config.GROQ_API_KEY,      model: config.GEN_MODEL },
  ollama:    { baseURL: 'http://localhost:11434/v1',                                apiKey: 'ollama',                 model: config.GEN_MODEL },
};

export const genProvider = GEN_PROVIDERS[config.AI_PROVIDER];

/** True when the active generation provider has a usable API key. */
export function hasGenApiKey(): boolean {
  return genProvider.apiKey.length > 0;
}

export interface EmbedConfig extends ProviderConfig {
  dimensions: number;
}

export const embedProvider: EmbedConfig = {
  baseURL: config.EMBED_BASE_URL,
  apiKey: config.EMBED_API_KEY || config.GEMINI_API_KEY,
  model: config.EMBED_MODEL,
  dimensions: config.EMBED_DIMENSIONS,
};
