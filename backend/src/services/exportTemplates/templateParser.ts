import yaml from 'js-yaml';

export type TemplateFormat = 'json' | 'yaml' | 'xml';
export type TemplateFieldKind = 'text' | 'number' | 'boolean' | 'array' | 'object';
export type TemplateControl = 'text' | 'number' | 'checkbox' | 'json' | 'rows' | 'dialogFlow' | 'date';
export type TemplateFieldShape =
  | 'scalar'
  | 'date'
  | 'object'
  | 'array'
  | 'objectRows'
  | 'scalarList'
  | 'conditionGroup'
  | 'conditionList'
  | 'mixedList';
export type GameplayRole =
  | 'questName'
  | 'questId'
  | 'questFlag'
  | 'preQuest'
  | 'ongoingQuestRequirement'
  | 'completedQuestRequirement'
  | 'requirement'
  | 'combatRequirement'
  | 'collectionRequirement'
  | 'reward'
  | 'itemReward'
  | 'currencyReward'
  | 'experienceReward'
  | 'questDialog'
  | 'other';

export interface TemplateFieldSummary {
  path: string;
  templatePath: string;
  label: string;
  kind: TemplateFieldKind;
  valueType: 'string' | 'number' | 'boolean' | 'array' | 'object';
  control: TemplateControl;
  shape: TemplateFieldShape;
  gameplayRole: GameplayRole;
  fillSource: 'node' | 'graph' | 'ai' | 'manual' | 'templateDefault';
  required: boolean;
  description: string;
  defaultValue?: unknown;
  itemSchema?: Array<{
    path: string;
    label: string;
    valueType: 'string' | 'number' | 'boolean';
    required: boolean;
  }>;
}

export interface TemplateSchema {
  version: number;
  summary: string;
  editableFields: TemplateFieldSummary[];
  generationContract: {
    requirementRoles: string[];
    rewardRoles: string[];
    dialogRoles: string[];
    promptSummary: string;
  };
  exportBindings: Array<{
    path: string;
    source: 'node.title' | 'node.exportFields' | 'node.templateValues' | 'graph.incomingEdges' | 'template.default';
  }>;
}

export interface TemplateAstElement {
  type: 'element';
  tag: string;
  attrs: Record<string, string>;
  children: TemplateAstNode[];
}

export interface TemplateAstText {
  type: 'text';
  text: string;
}

export interface TemplateAstComment {
  type: 'comment';
  text: string;
}

export type TemplateAstNode = TemplateAstElement | TemplateAstText | TemplateAstComment;

export interface ParsedTemplate {
  format: TemplateFormat;
  structure: unknown;
  templateAst?: TemplateAstNode;
  fieldSchema: TemplateFieldSummary[];
  templateSchema: TemplateSchema;
  schemaSummary: {
    requirementFields: string[];
    rewardFields: string[];
    dialogFields: string[];
    structureSummary: string;
  };
  inferredAiGuidance: {
    objectiveFields: string[];
    rewardFields: string[];
    structureSummary: string;
  };
}

function getKind(value: unknown): TemplateFieldKind {
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (value !== null && typeof value === 'object') return 'object';
  return 'text';
}

function toValueType(kind: TemplateFieldKind): TemplateFieldSummary['valueType'] {
  if (kind === 'text') return 'string';
  return kind;
}

function toScalarValueType(kind: TemplateFieldKind): 'string' | 'number' | 'boolean' | undefined {
  if (kind === 'text') return 'string';
  if (kind === 'number' || kind === 'boolean') return kind;
  return undefined;
}

function toFriendlyLabel(path: string): string {
  const leaf = path.replace(/\[\]/g, '').split('.').pop() ?? path;
  return leaf
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function inferRole(path: string): GameplayRole {
  const normalized = path.toLowerCase();
  if (
    /dialog|dialogue|conversation/.test(normalized)
    || /(^|\.)(start|inprogress|in_progress|progress|complete)\.pages($|\.)/.test(normalized)
    || /(^|\.)pages($|\.)/.test(normalized)
  ) return 'questDialog';
  if (/quest.*id|questid|^id$/.test(normalized)) return 'questId';
  if (/ongoing.*quest|ongoingquest/.test(normalized)) return 'ongoingQuestRequirement';
  if (/completed.*quest|completedquest|pre.*quest|prereq|require.*quest/.test(normalized)) return 'completedQuestRequirement';
  if (/daily|repeat|silent|flag/.test(normalized)) return 'questFlag';
  if (/reward.*item|items?\[\]|itemreward/.test(normalized)) return 'itemReward';
  if (/meso|money|currency|coin|gold/.test(normalized)) return 'currencyReward';
  if (/(^|\.)exp$|experience/.test(normalized)) return 'experienceReward';
  if (/reward/.test(normalized)) return 'reward';
  if (/kill|monster|mob|defeat|combat/.test(normalized)) return 'combatRequirement';
  if (/collect|item|quantity|drop|reactor/.test(normalized)) return 'collectionRequirement';
  if (/requirement|objective|task/.test(normalized)) return 'requirement';
  if (/name|title/.test(normalized)) return 'questName';
  return 'other';
}

function controlFor(kind: TemplateFieldKind, role: GameplayRole, shape: TemplateFieldShape): TemplateControl {
  if (shape === 'date') return 'date';
  if (role === 'questDialog') return 'dialogFlow';
  if (kind === 'boolean') return 'checkbox';
  if (kind === 'number') return 'number';
  if (kind === 'array') return 'rows';
  if (kind === 'object') return 'json';
  return 'text';
}

function cloneDefaultValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isDateLikeString(value: unknown): boolean {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isConditionList(value: unknown): boolean {
  return Array.isArray(value)
    && value.every((item) => !isPlainObject(item) || isConditionGroup(item));
}

function isConditionGroup(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  const entries = Object.entries(value);
  return entries.length > 0 && entries.every(([, child]) => isConditionList(child));
}

function inferShape(value: unknown, _path: string, kind: TemplateFieldKind, itemSchema?: TemplateFieldSummary['itemSchema']): TemplateFieldShape {
  if (isDateLikeString(value)) return 'date';
  if (isConditionGroup(value)) return 'conditionGroup';
  if (Array.isArray(value)) {
    if (value.some((item) => isConditionGroup(item))) return 'conditionList';
    if (value.some((item) => isPlainObject(item) || Array.isArray(item))) return itemSchema?.length ? 'objectRows' : 'mixedList';
    return 'scalarList';
  }
  if (kind === 'object') return 'object';
  return 'scalar';
}

function fillSourceFor(role: GameplayRole): TemplateFieldSummary['fillSource'] {
  if (role === 'questName') return 'node';
  if (role === 'preQuest' || role === 'completedQuestRequirement') return 'graph';
  if (role === 'requirement' || role === 'combatRequirement' || role === 'collectionRequirement' || role === 'questDialog' || role === 'ongoingQuestRequirement') return 'ai';
  if (role === 'questFlag') return 'templateDefault';
  return 'manual';
}

function makeField(path: string, kind: TemplateFieldKind, value?: unknown, itemSchema?: TemplateFieldSummary['itemSchema']): TemplateFieldSummary {
  const role = inferRole(path);
  const shape = inferShape(value, path, kind, itemSchema);
  return {
    path,
    templatePath: path,
    label: toFriendlyLabel(path),
    kind,
    valueType: toValueType(kind),
    control: controlFor(kind, role, shape),
    shape,
    gameplayRole: role,
    fillSource: fillSourceFor(role),
    required: false,
    description: `Template field "${path}" analyzed as ${role}.`,
    defaultValue: cloneDefaultValue(value),
    itemSchema,
  };
}

function walkFields(value: unknown, prefix = ''): TemplateFieldSummary[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? [makeField(prefix, getKind(value), value)] : [];
  }

  const objectValue = value as Record<string, unknown>;
  return Object.entries(objectValue).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    const kind = getKind(child);
    const itemSchema = Array.isArray(child) && child[0] && typeof child[0] === 'object'
      ? Object.entries(child[0] as Record<string, unknown>).flatMap(([itemKey, itemValue]) => {
        const valueType = toScalarValueType(getKind(itemValue));
        return valueType ? [{
          path: itemKey,
          label: toFriendlyLabel(itemKey),
          valueType,
          required: false,
        }] : [];
      })
      : undefined;
    const current = makeField(path, kind, child, itemSchema);
    if (child !== null && typeof child === 'object' && !Array.isArray(child)) {
      return [current, ...walkFields(child, path)];
    }
    return [current];
  });
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([\w:-]+)\s*=\s*"([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(raw)) !== null) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function parseXmlAst(xml: string): TemplateAstElement {
  const cleaned = xml.replace(/<\?xml[^>]*>/g, '').trim();
  const root: TemplateAstElement = { type: 'element', tag: '__root__', attrs: {}, children: [] };
  const stack: TemplateAstElement[] = [root];
  const tokenRegex = /<!--([\s\S]*?)-->|<([\w:-]+)([^>]*?)\/>|<([\w:-]+)([^>]*?)>|<\/([\w:-]+)>|([^<]+)/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(cleaned)) !== null) {
    const parent = stack[stack.length - 1];
    if (match[1] !== undefined) {
      parent.children.push({ type: 'comment', text: match[1] });
    } else if (match[2]) {
      parent.children.push({ type: 'element', tag: match[2], attrs: parseAttrs(match[3] ?? ''), children: [] });
    } else if (match[4]) {
      const element: TemplateAstElement = { type: 'element', tag: match[4], attrs: parseAttrs(match[5] ?? ''), children: [] };
      parent.children.push(element);
      stack.push(element);
    } else if (match[6]) {
      if (stack.length === 1 || stack[stack.length - 1].tag !== match[6]) {
        throw new Error(`Invalid XML template near closing tag ${match[6]}`);
      }
      stack.pop();
    } else if (match[7]?.trim()) {
      parent.children.push({ type: 'text', text: match[7].trim() });
    }
  }

  if (stack.length !== 1) throw new Error('XML template has unclosed tags');
  const elements = root.children.filter((child): child is TemplateAstElement => child.type === 'element');
  if (elements.length !== 1) throw new Error('XML template must have one root element');
  return elements[0];
}

function xmlScalarValue(element: TemplateAstElement): unknown {
  const raw = element.attrs.value ?? '';
  if (element.tag === 'int' || element.tag === 'long' || element.tag === 'short') {
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  }
  if (element.tag === 'string') return raw;
  return raw;
}

function xmlChildPath(element: TemplateAstElement, parentPath: string): string {
  const name = element.attrs.name || element.tag;
  if (/^\d+$/.test(name)) return parentPath ? `${parentPath}[]` : '[]';
  return parentPath ? `${parentPath}.${name}` : name;
}

function xmlAstToStructure(element: TemplateAstElement): unknown {
  if ('value' in element.attrs && element.attrs.name) return xmlScalarValue(element);
  const objectValue: Record<string, unknown> = {};
  for (const child of element.children) {
    if (child.type !== 'element') continue;
    const key = child.attrs.name || child.tag;
    const value = xmlAstToStructure(child);
    if (objectValue[key] === undefined) {
      objectValue[key] = value;
    } else if (Array.isArray(objectValue[key])) {
      (objectValue[key] as unknown[]).push(value);
    } else {
      objectValue[key] = [objectValue[key], value];
    }
  }
  return objectValue;
}

function inferXmlItemSchema(children: TemplateAstElement[]): TemplateFieldSummary['itemSchema'] {
  const sample = children.find((child) => /^\d+$/.test(child.attrs.name ?? ''));
  if (!sample) return undefined;
  return sample.children
    .filter((child): child is TemplateAstElement => child.type === 'element' && child.attrs.name !== undefined && 'value' in child.attrs)
    .flatMap((child) => {
      const valueType = toScalarValueType(getKind(xmlScalarValue(child)));
      return valueType ? [{
        path: child.attrs.name,
        label: toFriendlyLabel(child.attrs.name),
        valueType,
        required: false,
      }] : [];
    });
}

function walkXmlFields(element: TemplateAstElement, parentPath = '', isRoot = true): TemplateFieldSummary[] {
  const path = isRoot ? '' : xmlChildPath(element, parentPath);
  const fields: TemplateFieldSummary[] = [];

  if (isRoot && element.tag === 'imgdir' && element.attrs.name) {
    fields.push(makeField('name', 'text', element.attrs.name));
  }

  if (!isRoot && element.attrs.name && 'value' in element.attrs) {
    const value = xmlScalarValue(element);
    return [makeField(path, getKind(value), value)];
  }

  const elementChildren = element.children.filter((child): child is TemplateAstElement => child.type === 'element');
  const numericChildren = elementChildren.filter((child) => /^\d+$/.test(child.attrs.name ?? ''));

  if (!isRoot && numericChildren.length > 0) {
    fields.push(makeField(path, 'array', undefined, inferXmlItemSchema(elementChildren)));
  } else if (!isRoot && path) {
    fields.push(makeField(path, 'object'));
  }

  for (const child of elementChildren) {
    if (/^\d+$/.test(child.attrs.name ?? '')) {
      // Numeric imgdir children are represented by the parent array field's
      // itemSchema. Do not expose every row property as a separate top-level
      // editable field; otherwise the UI shows itemId/quantity detached from
      // their toCollect/toKill parent list.
      continue;
    } else {
      fields.push(...walkXmlFields(child, path, false));
    }
  }

  return fields;
}

function buildSchema(fields: TemplateFieldSummary[]): TemplateSchema {
  const requirementFields = fields.filter((field) => field.gameplayRole.includes('Requirement')).map((field) => field.path);
  const rewardFields = fields.filter((field) => field.gameplayRole.includes('Reward') || field.gameplayRole === 'reward').map((field) => field.path);
  const dialogFields = fields.filter((field) => field.gameplayRole === 'questDialog').map((field) => field.path);
  const structureSummary = fields.map((field) => `${field.label} (${field.path}, ${field.gameplayRole})`).join(', ');

  return {
    version: 1,
    summary: structureSummary || 'No editable fields detected',
    editableFields: fields,
    generationContract: {
      requirementRoles: requirementFields,
      rewardRoles: rewardFields,
      dialogRoles: dialogFields,
      promptSummary: structureSummary,
    },
    exportBindings: fields.map((field) => ({
      path: field.path,
      source: field.fillSource === 'node'
        ? 'node.title'
        : field.fillSource === 'graph'
        ? 'graph.incomingEdges'
        : field.fillSource === 'templateDefault'
        ? 'template.default'
        : 'node.templateValues',
    })),
  };
}

export function detectTemplateFormat(raw: string, explicit?: TemplateFormat): TemplateFormat {
  if (explicit) return explicit;
  const trimmed = raw.trim();
  if (trimmed.startsWith('<')) return 'xml';
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  return 'yaml';
}

export function parseTemplate(raw: string, explicitFormat?: TemplateFormat): ParsedTemplate {
  const format = detectTemplateFormat(raw, explicitFormat);
  let structure: unknown;
  let templateAst: TemplateAstNode | undefined;
  let fieldSchema: TemplateFieldSummary[];

  if (format === 'json') {
    structure = JSON.parse(raw);
    fieldSchema = walkFields(structure);
  } else if (format === 'yaml') {
    structure = yaml.load(raw);
    fieldSchema = walkFields(structure);
  } else {
    templateAst = parseXmlAst(raw);
    structure = xmlAstToStructure(templateAst);
    fieldSchema = walkXmlFields(templateAst);
  }

  if (structure === null || typeof structure !== 'object') {
    throw new Error('Template must describe an object');
  }

  const templateSchema = buildSchema(fieldSchema);
  const requirementFields = fieldSchema.filter((field) => field.gameplayRole.includes('Requirement')).map((field) => field.path);
  const rewardFields = fieldSchema.filter((field) => field.gameplayRole.includes('Reward') || field.gameplayRole === 'reward').map((field) => field.path);
  const dialogFields = fieldSchema.filter((field) => field.gameplayRole === 'questDialog').map((field) => field.path);
  const structureSummary = templateSchema.summary;

  return {
    format,
    structure,
    templateAst,
    fieldSchema,
    templateSchema,
    schemaSummary: {
      requirementFields,
      rewardFields,
      dialogFields,
      structureSummary,
    },
    inferredAiGuidance: {
      objectiveFields: requirementFields,
      rewardFields,
      structureSummary,
    },
  };
}
