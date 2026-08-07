import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

// z.default() only fires when a key is absent. A key that is present but blank
// (a bare `FOO=` line) parses as '' and silently defeats the default, which for
// a path or a URL fails much later and much more confusingly.
const nonEmpty = (fallback: string) =>
    z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().default(fallback));

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
    // --- RunPod Serverless (image generation) ---
    RUNPOD_API_KEY: z.string().default(''),
    RUNPOD_API_BASE: nonEmpty('https://api.runpod.ai/v2'),
    // Where the build-time manifest is hosted. Blank is meaningful here — it
    // means "skip the URL and use the bundled file" (the local-shim setup).
    RUNPOD_MANIFEST_URL: z.string().default(''),
    RUNPOD_MANIFEST_FALLBACK_PATH: nonEmpty('config/manifest.json'),
    RUNPOD_POLL_INTERVAL_MS: z.coerce.number().default(2_000),
    // Must comfortably cover a cold start (tens of seconds) plus generation
    RUNPOD_JOB_TIMEOUT_MS: z.coerce.number().default(300_000),
    // Comma-separated emails promoted to admin ONCE (bootstrap only) — after
    // that, roles are managed from the admin page (/admin/users)
    ADMIN_EMAILS: z
        .string()
        .default('')
        .transform((v) =>
            v
                .split(',')
                .map((e) => e.trim().toLowerCase())
                .filter((e) => e.length > 0),
        ),
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
    // --- PixelLab (sprite animation / rotations) ---
    PIXELLAB_API_KEY: z.string().default(''),
    PIXELLAB_API_URL: z.string().default('https://api.pixellab.ai/v2'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error('Invalid environment variables:');
    console.error(z.flattenError(parsed.error).fieldErrors);
    process.exit(1);
}

export const config = parsed.data;
