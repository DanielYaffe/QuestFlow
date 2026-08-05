import { StudioError } from '../studioError';

// ---------------------------------------------------------------------------
// Sprite version history — pure helpers over assets.rawSpriteCandidates.
//
// The candidate array is the version log: generating, attaching and every
// image tool append a new S3 key. assets.spriteHistoryIndex is the cursor the
// undo/redo controls move; snappedSpriteS3Key is whatever the cursor points at.
// Shared by characterStudioService and itemService.
// ---------------------------------------------------------------------------

export interface SpriteHistoryState {
  candidates: string[];
  index: number;
}

function isIndexInRange(value: number | undefined, length: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < length;
}

/**
 * The cursor for a record: the stored index when usable, else the position of
 * the canonical sprite, else the newest candidate. -1 when there is no history.
 */
export function resolveIndex(
  candidates: string[],
  snappedKey: string,
  storedIndex?: number,
): number {
  if (candidates.length === 0) return -1;
  if (isIndexInRange(storedIndex, candidates.length)) return storedIndex;
  const snapped = snappedKey ? candidates.indexOf(snappedKey) : -1;
  return snapped >= 0 ? snapped : candidates.length - 1;
}

/**
 * Record a new version at the cursor. Anything after the cursor is a redo tail
 * from an earlier undo and is discarded — the new edit branches from where the
 * user actually is. The oldest entries are pruned once the cap is exceeded.
 */
export function pushVersion(
  candidates: string[],
  index: number,
  newKey: string,
  max: number,
): SpriteHistoryState {
  const kept = index >= 0 ? candidates.slice(0, index + 1) : [];
  const next = [...kept, newKey].slice(-max);
  return { candidates: next, index: next.length - 1 };
}

/** The key at `index`, for undo / redo / history-strip clicks. */
export function selectVersion(candidates: string[], index: number): string {
  if (!isIndexInRange(index, candidates.length)) {
    throw new StudioError('No sprite version at that position', 400);
  }
  return candidates[index];
}
