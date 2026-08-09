import QuestlineModel from '../../models/questlineModel';
import ExportTemplateModel from '../../models/exportTemplateModel';
import CharacterModel from '../../models/characterModel';
import ItemModel from '../../models/itemModel';
import { buildExportPayload } from './buildExportPayload';
import { formats } from './formats';
import { CanonicalNode, ExportFile, Format, ExportResult } from './types';
import { TemplateAstNode, TemplateFieldSummary } from '../exportTemplates/templateParser';
import yaml from 'js-yaml';

export type { Format, ExportResult } from './types';
export { formats } from './formats';

function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'questline';
}

function isTemplateFormat(format: Format): boolean {
  return format === 'template-json' || format === 'template-yaml' || format === 'template-xml';
}

function formatFromTemplateFormat(format: Format): 'json' | 'yaml' | 'xml' {
  if (format === 'template-json') return 'json';
  if (format === 'template-xml') return 'xml';
  return 'yaml';
}

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function renderXmlValue(key: string, value: unknown): string {
  if (Array.isArray(value)) {
    return `<${key}>${value.map((item) => renderXmlValue('item', item)).join('')}</${key}>`;
  }
  if (value !== null && typeof value === 'object') {
    return `<${key}>${Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => renderXmlValue(childKey, childValue)).join('')}</${key}>`;
  }
  return `<${key}>${escapeXml(value)}</${key}>`;
}

function renderObject(value: unknown, format: 'json' | 'yaml' | 'xml'): string {
  if (format === 'json') return JSON.stringify(value, null, 2);
  if (format === 'yaml') return yaml.dump(value, { lineWidth: 100, noRefs: true });
  return `<?xml version="1.0" encoding="UTF-8"?>\n${renderXmlValue('quest', value)}\n`;
}

type TemplateLike = {
  structure?: unknown;
  templateAst?: TemplateAstNode;
  fieldSchema?: TemplateFieldSummary[];
  templateSchema?: { editableFields?: TemplateFieldSummary[] };
};

function buildDefaultTemplateQuest(node: CanonicalNode): Record<string, unknown> {
  const fields = node.exportFields;
  const fallbackNodeId = node.id.replace(/^quest_/, '');
  const fallbackQuestId = parseInt(fallbackNodeId, 10);
  return {
    name: node.title,
    quest_id: fields?.questId ?? (Number.isFinite(fallbackQuestId) ? fallbackQuestId : fallbackNodeId),
    silent: String(fields?.silent ?? true),
    pre_quest: fields?.preQuest?.length ? fields.preQuest : [-1],
    daily: String(fields?.daily ?? false),
    to_kill: (fields?.toKill ?? []).map((target) => ({ id: target.id, amount: target.amount })),
    to_collect: (fields?.toCollect ?? []).map((target) => ({ item_id: target.itemId, amount: target.amount })),
    rewards: {
      items: (fields?.rewardItems ?? []).map((item) => ({ id: item.id, amount: item.amount })),
    },
  };
}

function buildTemplateValues(node: CanonicalNode): Record<string, unknown> {
  const fields = node.exportFields;
  const fallbackNodeId = node.id.replace(/^quest_/, '');
  const fallbackQuestId = parseInt(fallbackNodeId, 10);

  return {
    name: node.title,
    quest_id: fields?.questId ?? (Number.isFinite(fallbackQuestId) ? fallbackQuestId : fallbackNodeId),
    silent: String(fields?.silent ?? true),
    pre_quest: fields?.preQuest?.length ? fields.preQuest : [-1],
    daily: String(fields?.daily ?? false),
    to_kill: (fields?.toKill ?? []).map((target) => ({ id: target.id, amount: target.amount })),
    to_collect: (fields?.toCollect ?? []).map((target) => ({ item_id: target.itemId, amount: target.amount })),
    rewards: {
      items: (fields?.rewardItems ?? []).map((item) => ({ id: item.id, amount: item.amount })),
    },
  };
}

function getPathValue(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (current !== null && typeof current === 'object' && !Array.isArray(current)) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, value);
}

function fieldPathMatches(fieldPath: string, path: string): boolean {
  return fieldPath === path || fieldPath.replace(/\[\]/g, '') === path.replace(/\[\]/g, '');
}

function fieldsFromTemplate(template: TemplateLike): TemplateFieldSummary[] {
  return template.templateSchema?.editableFields?.length
    ? template.templateSchema.editableFields
    : template.fieldSchema ?? [];
}

function findField(fields: TemplateFieldSummary[], path: string): TemplateFieldSummary | undefined {
  return fields.find((field) => fieldPathMatches(field.path, path));
}

function fallbackQuestId(node: CanonicalNode): number | string {
  const fallbackNodeId = node.id.replace(/^quest_/, '');
  const fallbackId = parseInt(fallbackNodeId, 10);
  return Number.isFinite(fallbackId) ? fallbackId : fallbackNodeId;
}

function hasOwnValue(values: Record<string, unknown> | undefined, path: string): boolean {
  return Boolean(values && Object.prototype.hasOwnProperty.call(values, path));
}

function hasDescendantValue(values: Record<string, unknown> | undefined, path: string): boolean {
  if (!values) return false;
  return Object.keys(values).some((key) => key.startsWith(`${path}.`));
}

function valueForField(
  node: CanonicalNode,
  field: TemplateFieldSummary | undefined,
  path: string,
  original: unknown,
): { value: unknown; explicit: boolean; mapped: boolean } {
  const hasEditedValue = path ? hasOwnValue(node.templateValues, path) : false;
  const editedValue = hasEditedValue ? node.templateValues?.[path] : undefined;
  if (hasEditedValue) return { value: editedValue, explicit: true, mapped: false };

  const role = field?.gameplayRole;
  if (role === 'questName') return { value: node.title, explicit: false, mapped: true };
  if (role === 'questId') return { value: node.exportFields?.questId ?? fallbackQuestId(node), explicit: false, mapped: true };
  if (role === 'preQuest' || role === 'completedQuestRequirement') {
    const preQuest = node.exportFields?.preQuest?.length ? node.exportFields.preQuest : original;
    return {
      value: field?.shape === 'conditionGroup' ? graphQuestValueForShape(original, preQuest) : preQuest,
      explicit: false,
      mapped: true,
    };
  }
  if (field?.fillSource === 'templateDefault') return { value: original, explicit: false, mapped: false };
  return { value: undefined, explicit: false, mapped: false };
}

function graphQuestValueForShape(original: unknown, preQuest: unknown): unknown {
  if (original !== null && typeof original === 'object' && !Array.isArray(original)) {
    const keys = Object.keys(original as Record<string, unknown>);
    if (keys.length > 0) return { [keys[0]]: Array.isArray(preQuest) ? preQuest : [] };
  }
  return preQuest;
}

function isEmptyExportValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (typeof value === 'number') return value === 0;
  if (typeof value === 'boolean') return value === false;
  if (Array.isArray(value)) {
    return value.length === 0 || value.every((item) => isEmptyExportValue(item));
  }
  if (typeof value === 'object') {
    const entries = Object.values(value as Record<string, unknown>);
    return entries.length === 0 || entries.every((item) => isEmptyExportValue(item));
  }
  return false;
}

function shouldKeepDirectValue(field: TemplateFieldSummary | undefined, value: unknown, explicit: boolean, mapped: boolean): boolean {
  if (explicit || mapped) return value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === '');
  if (field?.fillSource === 'templateDefault') return !isEmptyExportValue(value);
  return !isEmptyExportValue(value);
}

function pruneExportValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value
      .map((item) => pruneExportValue(item))
      .filter((item) => !isEmptyExportValue(item));
    return items.length > 0 ? items : undefined;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, child]) => [key, pruneExportValue(child)] as const)
      .filter(([, child]) => !isEmptyExportValue(child));
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }
  return value;
}

function renderTemplateStructure(structure: unknown, node: CanonicalNode, fields: TemplateFieldSummary[], path = ''): unknown {
  const field = path ? findField(fields, path) : undefined;
  const direct = path ? valueForField(node, field, path, structure) : { value: undefined, explicit: false, mapped: false };
  const shouldPreferNestedValues = path
    && structure !== null
    && typeof structure === 'object'
    && !Array.isArray(structure)
    && hasDescendantValue(node.templateValues, path);
  if (direct.value !== undefined && !shouldPreferNestedValues) {
    if (!shouldKeepDirectValue(field, direct.value, direct.explicit, direct.mapped)) return undefined;
    const pruned = pruneExportValue(direct.value);
    return pruned;
  }

  if (Array.isArray(structure)) {
    return undefined;
  }

  if (structure !== null && typeof structure === 'object') {
    const rendered = Object.fromEntries(
      Object.entries(structure as Record<string, unknown>)
        .map(([key, value]) => {
        const childPath = path ? `${path}.${key}` : key;
        return [key, renderTemplateStructure(value, node, fields, childPath)];
      })
        .filter(([, value]) => value !== undefined),
    );
    return Object.keys(rendered).length > 0 ? rendered : undefined;
  }

  return path ? undefined : structure;
}

function xmlAttrs(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([key, value]) => ` ${key}="${escapeXml(value)}"`)
    .join('');
}

function isXmlElement(node: TemplateAstNode): node is Extract<TemplateAstNode, { type: 'element' }> {
  return node.type === 'element';
}

function xmlPathFor(element: Extract<TemplateAstNode, { type: 'element' }>, parentPath: string): string {
  const name = element.attrs.name || element.tag;
  if (/^\d+$/.test(name)) return parentPath ? `${parentPath}[]` : '[]';
  return parentPath ? `${parentPath}.${name}` : name;
}

function xmlScalarDefault(element: Extract<TemplateAstNode, { type: 'element' }>, value: unknown): string {
  if (value !== undefined) return String(value);
  if (element.tag === 'int' || element.tag === 'long' || element.tag === 'short') return '0';
  return '';
}

function renderXmlItemFromTemplate(
  templateItem: Extract<TemplateAstNode, { type: 'element' }>,
  item: unknown,
  index: number,
): string | undefined {
  const itemValue = item !== null && typeof item === 'object' ? item as Record<string, unknown> : {};
  const attrs = { ...templateItem.attrs, name: String(index) };
  const children = templateItem.children.map((child) => {
    if (!isXmlElement(child) || !child.attrs.name || !('value' in child.attrs)) return renderTemplateXmlNode(child, {} as CanonicalNode, [], '');
    const value = itemValue[child.attrs.name];
    if (isEmptyExportValue(value)) return undefined;
    return `<${child.tag}${xmlAttrs({ ...child.attrs, value: xmlScalarDefault(child, value) })}/>`;
  }).filter(Boolean).join('');
  if (!children) return undefined;
  return `<${templateItem.tag}${xmlAttrs(attrs)}>${children}</${templateItem.tag}>`;
}

function renderTemplateXmlNode(
  ast: TemplateAstNode,
  node: CanonicalNode,
  fields: TemplateFieldSummary[],
  parentPath = '',
  isRoot = false,
): string | undefined {
  if (ast.type === 'text') return escapeXml(ast.text);
  if (ast.type === 'comment') return `<!--${ast.text}-->`;

  const path = isRoot ? '' : xmlPathFor(ast, parentPath);
  const attrs = { ...ast.attrs };
  if (isRoot && ast.tag === 'imgdir' && ast.attrs.name) {
    const rootNameField = findField(fields, 'name');
    const rootName = valueForField(node, rootNameField, 'name', ast.attrs.name);
    if (rootName.value !== undefined) attrs.name = String(rootName.value);
  }
  const field = path ? findField(fields, path) : undefined;
  const direct = path ? valueForField(node, field, path, ast.attrs.value) : { value: undefined, explicit: false, mapped: false };

  if (ast.attrs.name && 'value' in ast.attrs) {
    if (!shouldKeepDirectValue(field, direct.value, direct.explicit, direct.mapped)) return undefined;
    return `<${ast.tag}${xmlAttrs({ ...attrs, value: xmlScalarDefault(ast, direct.value) })}/>`;
  }

  const elementChildren = ast.children.filter(isXmlElement);
  const numericChildren = elementChildren.filter((child) => /^\d+$/.test(child.attrs.name ?? ''));
  const arrayField = path ? findField(fields, path) : undefined;
  const arrayValue = path ? node.templateValues?.[path] : undefined;

  if (numericChildren.length > 0 && arrayField) {
    const templateItem = numericChildren[0];
    const rows = Array.isArray(arrayValue) ? arrayValue : [];
    const renderedRows = rows.map((item, index) => renderXmlItemFromTemplate(templateItem, item, index)).filter(Boolean).join('');
    const nonNumericChildren = ast.children
      .filter((child) => !isXmlElement(child) || !/^\d+$/.test(child.attrs.name ?? ''))
      .map((child) => renderTemplateXmlNode(child, node, fields, path))
      .filter(Boolean)
      .join('');
    if (!isRoot && !nonNumericChildren && !renderedRows) return undefined;
    return `<${ast.tag}${xmlAttrs(attrs)}>${nonNumericChildren}${renderedRows}</${ast.tag}>`;
  }

  const children = ast.children.map((child) => renderTemplateXmlNode(child, node, fields, path)).filter(Boolean).join('');
  if (!isRoot && !children) return undefined;
  return `<${ast.tag}${xmlAttrs(attrs)}>${children}</${ast.tag}>`;
}

function joinPreview(files: ExportFile[]): string {
  return files.map((file) => `--- ${file.filename} ---\n${file.content}`).join('\n\n');
}

function snapshotHasStructure(snapshot: unknown): snapshot is TemplateLike {
  return snapshot !== null
    && typeof snapshot === 'object'
    && ('structure' in snapshot || 'templateAst' in snapshot);
}

export async function exportQuestline(
  questlineId: string,
  format: Format,
  options: { templateId?: string; nodeIds?: string[] } = {},
): Promise<ExportResult> {
  const questline = await QuestlineModel.findById(questlineId);
  if (!questline) {
    throw new Error('Questline not found');
  }

  const characterDocs = await CharacterModel.find({ _id: { $in: questline.characterIds ?? [] } }).lean();
  const itemDocs = await ItemModel.find({ _id: { $in: questline.itemIds ?? [] } }).lean();
  const payload = buildExportPayload(
    questline,
    characterDocs.map((c) => ({ _id: c._id, name: c.name, appearance: c.appearance ?? '', background: c.lore ?? '' })),
    itemDocs.map((i) => ({ _id: i._id, title: i.name, description: i.description ?? '', rarity: i.rarity ?? 'common' })),
  );

  const selectedNodeIdSet = new Set(options.nodeIds?.map((id) => id.startsWith('quest_') ? id : `quest_${id}`) ?? []);
  const filterNodes = (list: typeof payload.nodes) =>
    selectedNodeIdSet.size > 0 ? list.filter((n) => selectedNodeIdSet.has(n.id)) : list;

  if (isTemplateFormat(format)) {
    // Template exports are locked to the questline's own creation-time template —
    // a client-supplied templateId is ignored so the restriction can't be bypassed
    // via a direct API call.
    const selectedTemplateId = questline.templateId;
    const shouldUseSnapshot = selectedTemplateId && snapshotHasStructure(questline.templateSnapshot);
    const template: TemplateLike | null = shouldUseSnapshot
      ? questline.templateSnapshot as TemplateLike
      : selectedTemplateId
      ? await ExportTemplateModel.findOne({
        _id: selectedTemplateId,
        $or: [{ isBuiltIn: true }, { ownerId: questline.ownerId }],
      }).lean() as TemplateLike | null
      : null;
    if (selectedTemplateId && !template) throw new Error('Template not found');

    const selectedNodes = filterNodes(payload.nodes);
    const outputFormat = formatFromTemplateFormat(format);
    const extension = outputFormat === 'json' ? '.json' : outputFormat === 'xml' ? '.xml' : '.yaml';
    const mimeType = outputFormat === 'json' ? 'application/json' : outputFormat === 'xml' ? 'application/xml' : 'application/x-yaml';

    const files = selectedNodes.map((node) => {
      const filename = `${slugifyTitle(node.title || node.id)}${extension}`;
      const fields = template ? fieldsFromTemplate(template) : [];
      const content = outputFormat === 'xml' && template?.templateAst
        ? `<?xml version="1.0" encoding="UTF-8"?>\n${renderTemplateXmlNode(template.templateAst, node, fields, '', true) ?? ''}\n`
        : template?.structure
        ? renderObject(renderTemplateStructure(template.structure, node, fields) ?? {}, outputFormat)
        : renderObject(buildDefaultTemplateQuest(node), outputFormat);
      return {
        filename,
        content,
        mimeType,
      };
    });

    return {
      filename: files.length === 1 ? files[0].filename : `${slugifyTitle(questline.title)}-quests.txt`,
      content: files.length === 1 ? files[0].content : joinPreview(files),
      mimeType: files.length === 1 ? files[0].mimeType : 'text/plain',
      files,
    };
  }

  const formatModule = formats[format];
  if (!formatModule) {
    throw new Error(`Unknown format: ${format}`);
  }

  const selectedNodes = filterNodes(payload.nodes);
  const keepIds = new Set(selectedNodes.map((n) => n.id));
  const scopedPayload = selectedNodeIdSet.size > 0
    ? { ...payload, nodes: selectedNodes, edges: payload.edges.filter((e) => keepIds.has(e.source) && keepIds.has(e.target)) }
    : payload;

  const content = formatModule.render(scopedPayload);
  const filename = `${slugifyTitle(questline.title)}${formatModule.extension}`;

  return { filename, content, mimeType: formatModule.mimeType };
}
