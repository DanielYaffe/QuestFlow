// Tailwind class safelist for node-variant styling that arrives from the
// backend as data (NodeVariantConfig documents). Tailwind only generates
// classes it finds in source files, so every class the API can serve must be
// spelled out here verbatim — the base variant seeds, the AI-created variant
// palette (questGenerationController), and the legacy purple story variant
// for databases seeded before the Cyber renovation.
export const VARIANT_CLASS_SAFELIST: readonly string[] = [
  // base: story (cyan), combat (red), dialogue (blue), treasure (amber)
  'border-cyan-500', 'bg-cyan-500/10', 'text-cyan-400', 'shadow-cyan-500/50',
  'border-red-500', 'bg-red-500/10', 'text-red-400', 'shadow-red-500/50',
  'border-blue-500', 'bg-blue-500/10', 'text-blue-400', 'shadow-blue-500/50',
  'border-amber-500', 'bg-amber-500/10', 'text-amber-400', 'shadow-amber-500/50',
  // AI-created variant palette
  'border-emerald-500', 'bg-emerald-500/10', 'text-emerald-400', 'shadow-emerald-500/50',
  'border-orange-500', 'bg-orange-500/10', 'text-orange-400', 'shadow-orange-500/50',
  'border-pink-500', 'bg-pink-500/10', 'text-pink-400', 'shadow-pink-500/50',
  'border-violet-500', 'bg-violet-500/10', 'text-violet-400', 'shadow-violet-500/50',
  'border-yellow-500', 'bg-yellow-500/10', 'text-yellow-400', 'shadow-yellow-500/50',
  // legacy story palette (pre-renovation databases)
  'border-purple-500', 'bg-purple-500/10', 'text-purple-400', 'shadow-purple-500/50',
];
