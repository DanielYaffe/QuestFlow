import { CanonicalExport, CanonicalNode } from '../types';

// Which nodes flow into / out of this one — the per-node engine files replace
// the questline-wide edge list, so each file needs its own chain references.
export function adjacentNodeIds(node: CanonicalNode, payload: CanonicalExport): { prev: string[]; next: string[] } {
  return {
    prev: payload.edges.filter((e) => e.target === node.id).map((e) => e.source),
    next: payload.edges.filter((e) => e.source === node.id).map((e) => e.target),
  };
}
