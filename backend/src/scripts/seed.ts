import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { seedThemes } from '../models/seedThemes';
import { seedQuestStyles } from '../models/questStyleModel';
import { seedBaseVariants } from '../models/nodeVariantConfigModel';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

mongoose
  .connect(DATABASE_URL)
  .then(async () => {
    console.log('Connected to database');
    await seedQuestStyles();
    await seedBaseVariants();
    await seedThemes();
    console.log('Seeding complete');
  })
  .catch((err) => {
    console.error('Seeding failed:', err);
    process.exit(1);
  })
  .finally(() => mongoose.disconnect());
