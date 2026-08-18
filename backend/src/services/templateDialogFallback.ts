// ---------------------------------------------------------------------------
// Fallback dialog pages.
//
// When generation leaves a template's dialog array empty, one page is
// synthesized from the node so the author has something to edit. Doing that
// means deciding, for an arbitrary template, which item field holds the
// player-facing prose — and getting it wrong writes a scene's body into a
// page-link field, leaving the real prompt blank.
//
// The rule here is: a field is only a prompt candidate if it *can* hold prose.
// The row's identity and any field that links to another row are excluded
// outright, before any heuristic runs.
// ---------------------------------------------------------------------------

export interface DialogItemField {
  path: string;
  label?: string;
  valueType?: string;
}

export interface DialogArrayField {
  path: string;
  itemSchema?: DialogItemField[];
}

export interface DialogFallbackNode {
  id: string;
  title: string;
  body: string;
}

interface RelationshipHint {
  from: string;
  to: string;
  meaning?: string;
}

interface FieldHint {
  path?: unknown;
  meaning?: unknown;
  generationUse?: unknown;
}

export function parseArrayItemPath(path: string): { arrayPath: string; itemPath: string } | null {
  const marker = '[].';
  const index = path.indexOf(marker);
  if (index === -1) return null;
  const arrayPath = path.slice(0, index);
  const itemPath = path.slice(index + marker.length);
  if (!arrayPath || !itemPath || itemPath.includes('[].')) return null;
  return { arrayPath, itemPath };
}

/** Item paths that point at another row rather than carrying content. */
export function isNavigationItemPath(path: string): boolean {
  return /prev|previous|back|backward/i.test(path)
    || /next|forward/i.test(path)
    || /^(yes|no)$/i.test(path)
    || /branch|choice/i.test(path);
}

function relationshipHints(templateDoc: unknown, fieldPath: string): RelationshipHint[] {
  const hints = (templateDoc as { templateSchema?: { generationContract?: { relationshipHints?: unknown } } })
    ?.templateSchema?.generationContract?.relationshipHints;
  if (!Array.isArray(hints)) return [];
  return hints.filter((hint): hint is RelationshipHint => {
    if (!hint || typeof hint.from !== 'string' || typeof hint.to !== 'string') return false;
    const from = parseArrayItemPath(hint.from);
    const to = parseArrayItemPath(hint.to);
    return Boolean(from && to && from.arrayPath === fieldPath && to.arrayPath === fieldPath);
  });
}

function fieldHints(templateDoc: unknown): FieldHint[] {
  const hints = (templateDoc as { templateSchema?: { generationContract?: { fieldHints?: unknown } } })
    ?.templateSchema?.generationContract?.fieldHints;
  return Array.isArray(hints) ? hints : [];
}

/**
 * Every item path that links rows together: whatever a relationship hint names
 * as its source, plus the conventional navigation names.
 */
export function navigationItemKeys(templateDoc: unknown, field: DialogArrayField): Set<string> {
  const keys = new Set<string>();
  for (const hint of relationshipHints(templateDoc, field.path)) {
    const from = parseArrayItemPath(hint.from);
    if (from) keys.add(from.itemPath);
  }
  for (const item of field.itemSchema ?? []) {
    if (isNavigationItemPath(item.path)) keys.add(item.path);
  }
  return keys;
}

/** The row's stable identifier — what page-link fields point at. */
export function identityItemKeyForField(
  templateDoc: unknown,
  field: DialogArrayField,
): string | undefined {
  const linked = relationshipHints(templateDoc, field.path)
    .map((hint) => parseArrayItemPath(hint.to)?.itemPath)
    .find(Boolean);
  if (linked) return linked;

  // No relationship hints: a field literally named `id` beats schema order,
  // which is only a guess about how the template happened to be written. The
  // synthesized identity is a string, so a numeric field is never a candidate —
  // schema order alone once put "pages_page_1" into an npcId.
  const items = (field.itemSchema ?? []).filter((item) => (item.valueType ?? 'string') === 'string');
  return items.find((item) => /^id$/i.test(item.path))?.path
    ?? items.find((item) => /(^|_|\.)id$/i.test(item.path))?.path
    ?? items[0]?.path;
}

// Phrases that mark a hint as describing prose the player reads. Deliberately
// narrower than "mentions dialogue": every hint on a dialog page mentions
// dialogue, including the ones for ids, flags and page links.
const PLAYER_FACING_HINT = /player-facing|shown to the player|spoken|prompt|message|speech|narration/;

// A field named for what it holds is the most reliable signal available.
const PROMPT_ITEM_PATH = /^(prompt|text|message|line|speech|dialog|dialogue|body|content|say|caption)$/i;

/**
 * Which item field holds the page's player-facing text, or undefined when the
 * row has no field that could.
 */
export function promptItemKeyForField(
  templateDoc: unknown,
  field: DialogArrayField,
  identityKey?: string,
): string | undefined {
  const navigation = navigationItemKeys(templateDoc, field);
  const candidates = (field.itemSchema ?? []).filter((item) => (
    (item.valueType ?? 'string') === 'string'
    && item.path !== identityKey
    && !navigation.has(item.path)
  ));
  if (!candidates.length) return undefined;

  const named = candidates.find((item) => PROMPT_ITEM_PATH.test(item.path));
  if (named) return named.path;

  // Let the template's own hints choose, but only among fields already known to
  // be able to hold prose — the hint text alone is far too weak a filter.
  const allowed = new Set(candidates.map((item) => item.path));
  const hinted = fieldHints(templateDoc).find((hint) => {
    const parsed = typeof hint.path === 'string' ? parseArrayItemPath(hint.path) : null;
    if (!parsed || parsed.arrayPath !== field.path || !allowed.has(parsed.itemPath)) return false;
    return PLAYER_FACING_HINT.test(`${hint.meaning ?? ''} ${hint.generationUse ?? ''}`.toLowerCase());
  });
  if (hinted && typeof hinted.path === 'string') return parseArrayItemPath(hinted.path)?.itemPath;

  return candidates[0].path;
}

/**
 * One page carrying the node's body, so an empty dialog array is still editable.
 *
 * No entity id is invented: at this point a node's npcIds are still the wizard's
 * temp ids, whose digits are a position in a list rather than a game id.
 * applyEntityMappings runs afterwards with real design ids and fills mapped id
 * fields from the KB.
 */
export function buildFallbackDialogPages(
  templateDoc: unknown,
  field: DialogArrayField,
  node: DialogFallbackNode,
): Record<string, unknown>[] {
  const allowedKeys = new Set((field.itemSchema ?? []).map((item) => item.path));
  const identityKey = identityItemKeyForField(templateDoc, field);
  const promptKey = promptItemKeyForField(templateDoc, field, identityKey);
  const baseId = `${node.id}_${field.path.replace(/[^\w]+/g, '_')}`;
  const body = node.body || node.title;

  const page: Record<string, unknown> = {};
  if (identityKey) page[identityKey] = `${baseId}_page_1`;
  // Never let the prose land on the identity field, whatever the heuristics say.
  if (promptKey && promptKey !== identityKey) page[promptKey] = body;

  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(page)) {
    if (!allowedKeys.has(key) || value === undefined || value === '') continue;
    cleaned[key] = value;
  }
  // Surface the prompt field even when empty, so the author sees where the text
  // belongs. Keyed off the resolved field rather than a hard-coded name.
  if (promptKey && !(promptKey in cleaned) && allowedKeys.has(promptKey)) cleaned[promptKey] = '';

  return Object.keys(cleaned).length ? [cleaned] : [];
}
