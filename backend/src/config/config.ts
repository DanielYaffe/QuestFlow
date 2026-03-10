import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
    DATABASE_URL: z.string().min(1).default('mongodb://localhost:27017/matala1'),
    PORT: z.coerce.number().default(5000),
    JWT_SECRET: z.string().min(1).default('secret'),
    JWT_EXPIRES_IN: z.coerce.number().default(36000),
    REFRESH_TOKEN_EXPIRES_IN: z.coerce.number().default(36000),
    GEMINI_API_KEY: z.string().default(''),
    AWS_ACCESS_KEY_ID: z.string().default(''),
    AWS_SECRET_ACCESS_KEY: z.string().default(''),
    AWS_REGION: z.string().default('us-east-1'),
    AWS_S3_BUCKET: z.string().default(''),
    MINIO_ENDPOINT: z.string().default(''),
    GOOGLE_CLIENT_ID: z.string().default(''),
    GOOGLE_CLIENT_SECRET: z.string().default(''),
    GOOGLE_CALLBACK_URL: z.string().default('http://localhost:3000/auth/google/callback'),
    FRONTEND_URL: z.string().default('http://localhost:5173'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error('Invalid environment variables:');
    console.error(z.flattenError(parsed.error).fieldErrors);
    process.exit(1);
}

export const config = parsed.data;
