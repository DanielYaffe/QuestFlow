import React from 'react';

/**
 * Checkerboard background used to visualise sprite transparency.
 * Shared between the Sprite Generator and the Quest Create style picker so
 * both surfaces render style previews identically.
 */
export const CHECKER_STYLE: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg, #3f3f46 25%, transparent 25%), linear-gradient(-45deg, #3f3f46 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #3f3f46 75%), linear-gradient(-45deg, transparent 75%, #3f3f46 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
  backgroundColor: '#27272a',
};

/** Smaller-scale variant for thumbnails and grid cards. */
export const CHECKER_SM: React.CSSProperties = {
  ...CHECKER_STYLE,
  backgroundSize: '12px 12px',
  backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0px',
};
