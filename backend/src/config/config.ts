import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
    DATABASE_URL: z.string().min(1).default('mongodb://localhost:27017/matala1'),
    PORT: z.coerce.number().default(3000),
    JWT_SECRET: z.string().min(1).default('secret'),
    JWT_EXPIRES_IN: z.coerce.number().default(36000),
    REFRESH_TOKEN_EXPIRES_IN: z.coerce.number().default(36000),
    GEMINI_API_KEY: z.string().default(''),
    AWS_ACCESS_KEY_ID: z.string().default(''),
    AWS_SECRET_ACCESS_KEY: z.string().default(''),
    AWS_REGION: z.string().default('us-east-1'),
    AWS_S3_BUCKET: z.string().default(''),
    MINIO_ENDPOINT: z.string().default(''),
    // When MINIO_ENDPOINT is set, controls TLS cert verification for that endpoint.
    // Defaults to 'false' to tolerate the self-signed cert; set to 'true' once a
    // valid cert is in place to re-enable strict verification. No effect on AWS S3.
    MINIO_REJECT_UNAUTHORIZED: z
        .enum(['true', 'false'])
        .default('false')
        .transform((v) => v === 'true'),
    GOOGLE_CLIENT_ID: z.string().default(''),
    GOOGLE_CLIENT_SECRET: z.string().default(''),
    GOOGLE_CALLBACK_URL: z.string().default('http://localhost:3000/auth/google/callback'),
    FRONTEND_URL: z.string().default('http://localhost:5173'),
    REDIS_URL: z.string().default('redis://localhost:6379'),
    COMFYUI_ENDPOINT: z.string().default('http://127.0.0.1:8188'),
    ENCRYPTION_KEY: z.string().length(64).default('0'.repeat(64)),
    // --- AI generation (provider-swappable via OpenAI-compatible endpoints) ---
    AI_PROVIDER: z.enum(['gemini', 'openai', 'anthropic', 'groq', 'ollama']).default('gemini'),
    GEN_MODEL: z.string().default('gemini-2.5-flash-lite'),
    OPENAI_API_KEY: z.string().default(''),
    ANTHROPIC_API_KEY: z.string().default(''),
    GROQ_API_KEY: z.string().default(''),
    // --- Embeddings (PINNED — changing model/dimensions after ingest invalidates every stored vector) ---
    EMBED_BASE_URL: z.string().default('https://generativelanguage.googleapis.com/v1beta/openai/'),
    EMBED_API_KEY: z.string().default(''), // falls back to GEMINI_API_KEY in config/ai.ts
    EMBED_MODEL: z.string().default('gemini-embedding-001'),
    EMBED_DIMENSIONS: z.coerce.number().default(1536),
    // --- Qdrant vector store ---
    QDRANT_URL: z.string().default('http://localhost:6333'),
    QDRANT_API_KEY: z.string().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error('Invalid environment variables:');
    console.error(z.flattenError(parsed.error).fieldErrors);
    process.exit(1);
}

export const config = parsed.data;
