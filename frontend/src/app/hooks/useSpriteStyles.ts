import { useEffect, useState } from 'react';
import { getStyles, SpriteStyle } from '../api/spriteApi';

// ---------------------------------------------------------------------------
// The sprite style catalogue. Styles are admin-curated and change rarely, so
// the list is fetched once per session and shared — the studio reads it from
// several places (design sheets, style picker, generate dialog).
// ---------------------------------------------------------------------------

let cache: SpriteStyle[] | null = null;
let inFlight: Promise<SpriteStyle[]> | null = null;

function loadStyles(): Promise<SpriteStyle[]> {
  if (cache) return Promise.resolve(cache);
  if (!inFlight) {
    inFlight = getStyles()
      .then((list) => { cache = list; return list; })
      .catch(() => [])
      .finally(() => { inFlight = null; });
  }
  return inFlight;
}

export function useSpriteStyles(): { styles: SpriteStyle[]; loading: boolean } {
  const [styles, setStyles] = useState<SpriteStyle[]>(cache ?? []);
  const [loading, setLoading] = useState(cache === null);

  useEffect(() => {
    let active = true;
    void loadStyles().then((list) => {
      if (!active) return;
      setStyles(list);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  return { styles, loading };
}

/** The design's style, falling back to the first catalogue entry. */
export function resolveStyle(styles: SpriteStyle[], styleId: string | undefined): SpriteStyle | null {
  return styles.find((s) => s.id === styleId) ?? styles[0] ?? null;
}
