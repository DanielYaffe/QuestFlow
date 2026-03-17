/// <reference types="vite/client" />
import { useState, useEffect } from 'react';
import {
  Scroll, Swords, MessageCircle, Gem,
  Star, Flame, Zap, Shield, Eye, Heart,
  Skull, Ghost, Wand, Crown, Map, Key,
  Sparkles, Music, Book, Feather,
  type LucideIcon,
} from 'lucide-react';
import { fetchVariantConfigs, type VariantConfig } from '../api/variantConfigApi';

// ---------------------------------------------------------------------------
// Icon key → Lucide component map
// Add more entries here when you want the AI to use a specific icon
// ---------------------------------------------------------------------------

export const ICON_MAP: Record<string, LucideIcon> = {
  scroll:         Scroll,
  swords:         Swords,
  'message-circle': MessageCircle,
  gem:            Gem,
  star:           Star,
  flame:          Flame,
  zap:            Zap,
  shield:         Shield,
  eye:            Eye,
  heart:          Heart,
  skull:          Skull,
  ghost:          Ghost,
  wand:           Wand,
  crown:          Crown,
  map:            Map,
  key:            Key,
  sparkles:       Sparkles,
  music:          Music,
  book:           Book,
  feather:        Feather,
};

export type ResolvedVariantConfig = VariantConfig & { icon: LucideIcon };

const DEFAULT_CONFIG: ResolvedVariantConfig = {
  key: 'unknown',
  label: 'Unknown',
  iconKey: 'star',
  icon: Star,
  borderColor: 'border-zinc-500',
  bgColor: 'bg-zinc-500/10',
  iconColor: 'text-zinc-400',
  shadowColor: 'shadow-zinc-500/50',
  isBase: false,
};

// ---------------------------------------------------------------------------

export function resolveIcon(iconKey: string): LucideIcon {
  return ICON_MAP[iconKey] ?? Star;
}

export function useVariantConfigs() {
  const [configs, setConfigs] = useState<ResolvedVariantConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVariantConfigs()
      .then((raw) => {
        setConfigs(raw.map((c) => ({ ...c, icon: resolveIcon(c.iconKey) })));
      })
      .catch(() => {
        // On error fall back to empty — QuestNode will use DEFAULT_CONFIG
        setConfigs([]);
      })
      .finally(() => setLoading(false));
  }, []);

  function getConfig(variantKey: string): ResolvedVariantConfig {
    return configs.find((c) => c.key === variantKey) ?? DEFAULT_CONFIG;
  }

  return { configs, loading, getConfig };
}
