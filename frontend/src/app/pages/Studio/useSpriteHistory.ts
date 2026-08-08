import { useEffect } from 'react';

// ---------------------------------------------------------------------------
// Client half of the sprite version history. The cursor lives on the record
// (assets.spriteHistoryIndex); this mirrors the backend's resolveIndex so the
// sheets agree with the server about which version is current, and wires the
// undo/redo shortcut.
// ---------------------------------------------------------------------------

interface HistoryAssets {
  rawSpriteCandidates: string[];
  snappedSpriteS3Key: string;
  spriteHistoryIndex?: number;
}

/**
 * The current position in the version history: the stored cursor when usable,
 * else where the canonical sprite sits, else the newest version. -1 when empty.
 */
export function resolveHistoryIndex(assets: HistoryAssets, length: number): number {
  if (length === 0) return -1;
  const stored = assets.spriteHistoryIndex;
  if (typeof stored === 'number' && Number.isInteger(stored) && stored >= 0 && stored < length) {
    return stored;
  }
  const snapped = assets.snappedSpriteS3Key
    ? assets.rawSpriteCandidates.indexOf(assets.snappedSpriteS3Key)
    : -1;
  return snapped >= 0 ? snapped : length - 1;
}

const UNDO_SHORTCUT = 'KeyZ';

/**
 * Ctrl/Cmd+Z steps back through the sprite history, +Shift steps forward.
 * Inert while the user is typing, so the identity and stats forms keep the
 * browser's own text undo.
 */
export function useUndoShortcut(index: number, goToVersion: (next: number) => void): void {
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.code !== UNDO_SHORTCUT) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      event.preventDefault();
      goToVersion(index + (event.shiftKey ? 1 : -1));
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [index, goToVersion]);
}
