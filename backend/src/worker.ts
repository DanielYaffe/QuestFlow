import mongoose from 'mongoose';
import { config } from './config/config';
import './workers/spriteWorker';

mongoose.connect(config.DATABASE_URL).then(() => {
  console.log('[Worker] MongoDB connected');
  console.log('[Worker] All workers started');
}).catch((err) => {
  console.error('[Worker] MongoDB connection failed:', err);
  process.exit(1);
});
