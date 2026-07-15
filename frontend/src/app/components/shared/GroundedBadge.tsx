import { BookOpen } from 'lucide-react';

// Mark for content that references a real knowledge-base entity (character or
// item) rather than an AI invention. Emerald on purpose — distinct from the
// purple (selection) and amber (rewards) accents around it.
//
// entityName accepts either a plain entity name (wizard responses) or the
// persisted "{gameId}:{entityName}" tag — the gameId prefix is stripped.
export function GroundedBadge({ entityName, compact = false }: { entityName?: string; compact?: boolean }) {
  const displayName = entityName?.includes(':')
    ? entityName.slice(entityName.indexOf(':') + 1)
    : entityName;
  const title = displayName ? `From your knowledge base: ${displayName}` : 'From your knowledge base';

  if (compact) {
    return (
      <span
        title={title}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 shrink-0"
      >
        <BookOpen className="w-2.5 h-2.5" />
      </span>
    );
  }

  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 text-[10px] font-medium uppercase tracking-wide shrink-0"
    >
      <BookOpen className="w-3 h-3" />
      Grounded
    </span>
  );
}
