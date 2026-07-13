import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import QuestStyleModel from '../models/questStyleModel';
import { getPresignedUrl } from '../utils/s3Helper';

function getDefaultStyleThumbnail(engine: string, name: string): string {
  const palettes: Record<string, { bg: string; fg: string; accent: string }> = {
    'classic-rpg': { bg: '#2f2418', fg: '#f0c987', accent: '#7d4f2a' },
    'retro-anime': { bg: '#2d1637', fg: '#ff9fda', accent: '#5f7adb' },
    cyberpunk: { bg: '#111827', fg: '#67e8f9', accent: '#db2777' },
    ghibli: { bg: '#1f3b2d', fg: '#bbf7d0', accent: '#facc15' },
    'dark-fantasy': { bg: '#18181b', fg: '#d4d4d8', accent: '#7f1d1d' },
    'pixel-art': { bg: '#1e293b', fg: '#fde68a', accent: '#22c55e' },
  };
  const palette = palettes[engine] ?? { bg: '#18181b', fg: '#e4e4e7', accent: '#7c3aed' };
  const safeName = name.replace(/[<>&"]/g, '');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <rect width="640" height="360" fill="${palette.bg}"/>
  <circle cx="510" cy="82" r="96" fill="${palette.accent}" opacity=".35"/>
  <circle cx="128" cy="276" r="118" fill="${palette.accent}" opacity=".25"/>
  <path d="M0 264 C120 214 176 292 288 236 C392 184 480 220 640 154 L640 360 L0 360 Z" fill="${palette.accent}" opacity=".38"/>
  <rect x="48" y="46" width="544" height="268" rx="24" fill="none" stroke="${palette.fg}" stroke-opacity=".25" stroke-width="3"/>
  <text x="320" y="184" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="${palette.fg}">${safeName}</text>
  <text x="320" y="226" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="${palette.fg}" opacity=".72">Default style preview</text>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// ---------------------------------------------------------------------------
// GET /quest-styles — list all built-in styles with fresh presigned image URLs
// ---------------------------------------------------------------------------

export async function getQuestStyles(req: AuthRequest, res: Response) {
  try {
    const styles = await QuestStyleModel.find({ isBuiltIn: true }).sort({ tier: 1, name: 1 }).lean();

    const results = await Promise.all(
      styles.map(async (s) => {
        const imageUrl = s.imageKey ? await getPresignedUrl(s.imageKey).catch(() => '') : '';

        return {
          _id:          s._id.toString(),
          name:         s.name,
          engine:       s.engine,
          description:  s.description,
          promptSuffix: s.promptSuffix,
          tier:         s.tier,
          imageUrl:     imageUrl || getDefaultStyleThumbnail(s.engine, s.name),
        };
      }),
    );

    res.json(results);
  } catch (error) {
    console.error('[questStyleController] getQuestStyles error:', error);
    res.status(500).json({ error: 'Failed to fetch quest styles' });
  }
}
