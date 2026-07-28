import IORedis from 'ioredis';
import { config } from '../config/config';

export const redis = new IORedis(config.REDIS_URL, {
  maxRetriesPerRequest: null, // required by BullMQ
});

redis.on('error', (err) => console.error('[Redis] connection error:', err));
redis.on('connect', () => console.log('[Redis] connected'));
