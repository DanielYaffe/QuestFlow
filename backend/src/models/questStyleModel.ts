import mongoose, { Document, Schema } from 'mongoose';
import { GoogleGenAI, Modality } from '@google/genai';
import { config } from '../config/config';
import { uploadBufferToS3 } from '../utils/s3Helper';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface IQuestStyle extends Document {
  name: string;
  engine: string;           // slug, e.g. "retro-anime"
  description: string;
  promptSuffix: string;     // appended to Gemini image generation prompts
  imageKey: string;         // S3 key for the preview thumbnail
  tier: 'free' | 'pro' | 'plus';
  isBuiltIn: boolean;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const QuestStyleSchema = new Schema<IQuestStyle>(
  {
    name:         { type: String, required: true },
    engine:       { type: String, required: true, unique: true },
    description:  { type: String, default: '' },
    promptSuffix: { type: String, default: '' },
    imageKey:     { type: String, default: '' },
    tier:         { type: String, enum: ['free', 'pro', 'plus'], default: 'free' },
    isBuiltIn:    { type: Boolean, default: false },
  },
  { timestamps: true },
);

const QuestStyleModel = mongoose.model<IQuestStyle>('QuestStyle', QuestStyleSchema);
export default QuestStyleModel;

// ---------------------------------------------------------------------------
// Built-in style definitions
// ---------------------------------------------------------------------------

interface BuiltInStyle {
  name: string;
  engine: string;
  description: string;
  promptSuffix: string;
  tier: 'free' | 'pro' | 'plus';
  /** Prompt used to generate the preview thumbnail */
  thumbnailPrompt: string;
}

const BUILT_IN_STYLES: BuiltInStyle[] = [
  {
    name:         'Classic RPG',
    engine:       'classic-rpg',
    description:  'Traditional fantasy RPG with hand-painted environments and rich lore',
    tier:         'free',
    promptSuffix: 'Render in a classic high-fantasy RPG art style — hand-painted backgrounds, warm torchlit colours, detailed medieval architecture, reminiscent of Baldur\'s Gate or Dragon Age.',
    thumbnailPrompt: 'A dramatic fantasy tavern scene — warm candlelight, wooden beams, adventurers gathered around a map, painted in a classic high-fantasy RPG art style, rich warm tones, detailed medieval setting, no text, no UI, cinematic composition.',
  },
  {
    name:         'Retro Anime',
    engine:       'retro-anime',
    description:  'Classic 80s-90s anime aesthetic with vintage cel-shading and bold outlines',
    tier:         'pro',
    promptSuffix: 'Render in a retro 80s-90s anime art style — thick black outlines, cel-shaded flat colours, vintage grain, limited palette, expressive character designs reminiscent of classic JRPG anime cutscenes.',
    thumbnailPrompt: 'A fierce anime warrior standing dramatically before a burning city at sunset, retro 80s anime art style, thick cel-shaded outlines, vintage colour grading, warm oranges and reds, classic JRPG aesthetic, no text, no UI, cinematic widescreen.',
  },
  {
    name:         'Cyberpunk',
    engine:       'cyberpunk',
    description:  'Neon-drenched futuristic cityscape with rain-slicked streets and holograms',
    tier:         'pro',
    promptSuffix: 'Render in a cyberpunk art style — neon signs, rain-slicked streets, holographic overlays, dark atmospheric lighting with electric blues, pinks, and purples, gritty futuristic urban environment.',
    thumbnailPrompt: 'A rain-soaked cyberpunk city street at night, neon reflections, holographic advertisements, a lone figure in a long coat, dark moody atmosphere with electric blue and pink neons, highly detailed, cinematic, no text, no UI.',
  },
  {
    name:         'Ghibli Studio',
    engine:       'ghibli',
    description:  'Warm painterly scenes inspired by Studio Ghibli\'s magical animation style',
    tier:         'plus',
    promptSuffix: 'Render in a Studio Ghibli-inspired art style — warm soft watercolour-like backgrounds, lush green landscapes, gentle whimsical lighting, painterly hand-drawn feel, magical atmosphere reminiscent of Spirited Away or Princess Mononoke.',
    thumbnailPrompt: 'A vast lush green meadow with a cozy village nestled among ancient trees, a curious child looking at a glowing spirit creature, Studio Ghibli art style, soft warm watercolour painting, gentle golden light, magical atmosphere, no text, no UI.',
  },
  {
    name:         'Dark Fantasy',
    engine:       'dark-fantasy',
    description:  'Gothic horror meets medieval fantasy — grim, atmospheric, and foreboding',
    tier:         'free',
    promptSuffix: 'Render in a dark fantasy art style — gothic architecture, deep shadows, desaturated cool tones with blood-red accents, haunted atmosphere, intricate bone and wrought-iron details, reminiscent of Dark Souls or Bloodborne concept art.',
    thumbnailPrompt: 'A crumbling gothic cathedral at midnight with a full moon, gargoyles on the towers, a cloaked figure approaching the iron gates, dark fantasy concept art style, deep shadows, desaturated blues and greys with red accents, ominous and foreboding, no text, no UI.',
  },
  {
    name:         'Pixel Art',
    engine:       'pixel-art',
    description:  'Nostalgic 16-bit pixel art with chunky sprites and vibrant colour palettes',
    tier:         'free',
    promptSuffix: 'Render in a 16-bit pixel art style — chunky pixels, limited colour palette, vibrant saturated colours, classic SNES/Mega Drive game aesthetic, clean readable sprite work.',
    thumbnailPrompt: 'A colourful 16-bit pixel art RPG town at dusk — cobblestone streets, bright shop signs, pixel characters walking around, chunky sprite style, vibrant SNES colour palette, retro game screenshot composition, no text, no UI.',
  },
];

// ---------------------------------------------------------------------------
// Seed — upsert built-in styles and generate missing thumbnails
// ---------------------------------------------------------------------------

export async function seedQuestStyles(): Promise<void> {
  if (!config.GEMINI_API_KEY) return;

  for (const style of BUILT_IN_STYLES) {
    const existing = await QuestStyleModel.findOne({ engine: style.engine });

    if (existing) {
      // Update metadata but keep imageKey if already generated
      await QuestStyleModel.updateOne(
        { engine: style.engine },
        {
          $set: {
            name:         style.name,
            description:  style.description,
            promptSuffix: style.promptSuffix,
            tier:         style.tier,
            isBuiltIn:    true,
          },
        },
      );

      // Generate image only if missing
      if (!existing.imageKey) {
        await generateAndSaveThumbnail(existing._id.toString(), style.thumbnailPrompt, style.engine);
      }
    } else {
      // Create record first so we have an ID
      const created = await QuestStyleModel.create({
        name:         style.name,
        engine:       style.engine,
        description:  style.description,
        promptSuffix: style.promptSuffix,
        tier:         style.tier,
        isBuiltIn:    true,
        imageKey:     '',
      });

      // Generate preview thumbnail
      await generateAndSaveThumbnail(created._id.toString(), style.thumbnailPrompt, style.engine);
    }
  }

  console.log('[questStyles] Seed complete');
}

async function generateAndSaveThumbnail(id: string, prompt: string, engine: string): Promise<void> {
  try {
    if (!config.AWS_S3_BUCKET) return;

    const genAI = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY, httpOptions: { timeout: 120_000 } });
    const response = await genAI.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: prompt,
      config: { responseModalities: [Modality.IMAGE] },
    });

    const imagePart = response.candidates?.[0]?.content?.parts?.find(
      (p: { inlineData?: { mimeType?: string; data?: string } }) =>
        p.inlineData?.mimeType?.startsWith('image/'),
    );

    if (!imagePart?.inlineData?.data || !imagePart.inlineData.mimeType) return;

    const buffer = Buffer.from(imagePart.inlineData.data, 'base64');
    const imageKey = await uploadBufferToS3(buffer, imagePart.inlineData.mimeType, 'quest-styles', undefined, engine);

    await QuestStyleModel.findByIdAndUpdate(id, { imageKey });
    console.log(`[questStyles] Thumbnail generated for "${engine}"`);
  } catch (err) {
    console.error(`[questStyles] Failed to generate thumbnail for "${engine}":`, err);
  }
}
