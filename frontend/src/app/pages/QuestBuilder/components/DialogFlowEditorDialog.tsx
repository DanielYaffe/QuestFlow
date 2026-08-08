import React from 'react';
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  getBezierPath,
  Handle,
  Position,
  ReactFlow,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
  type ReactFlowInstance,
} from '@xyflow/react';
import { PanelRightClose, PanelRightOpen, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { getLayoutedElements } from '../../../utils/layoutUtils';
import { TemplateFieldSummary, TemplateSchema } from '../../../api/exportTemplateApi';

type DialogRow = Record<string, unknown>;

type DialogPageNodeData = {
  title: string;
  prompt: string;
  badges: string[];
  selected: boolean;
  isolated: boolean;
};

type DialogEdgeData = {
  sourceIndex: number;
  sourceField: string;
  reverseSourceIndex?: number;
  reverseSourceField?: string;
  bidirectional?: boolean;
  label: string;
};

type ParsedItemPath = {
  arrayPath: string;
  itemPath: string;
};

interface DialogFlowEditorDialogProps {
  isOpen: boolean;
  field: TemplateFieldSummary | null;
  templateSchema?: TemplateSchema;
  value: unknown;
  onClose: () => void;
  onChange: (next: DialogRow[]) => void;
}

function parseArrayItemPath(path: string): ParsedItemPath | null {
  const marker = '[].';
  const index = path.indexOf(marker);
  if (index === -1) return null;
  const arrayPath = path.slice(0, index);
  const itemPath = path.slice(index + marker.length);
  if (!arrayPath || !itemPath || itemPath.includes('[].')) return null;
  return { arrayPath, itemPath };
}

function normalizeRows(value: unknown): DialogRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => row && typeof row === 'object' && !Array.isArray(row) ? { ...row as DialogRow } : {});
}

function itemSchemaFor(field: TemplateFieldSummary | null): NonNullable<TemplateFieldSummary['itemSchema']> {
  return field?.itemSchema ?? [];
}

function relationshipsFor(field: TemplateFieldSummary | null, templateSchema?: TemplateSchema) {
  if (!field) return [];
  const explicit = (templateSchema?.generationContract?.relationshipHints ?? [])
    .map((hint) => ({ hint, from: parseArrayItemPath(hint.from), to: parseArrayItemPath(hint.to) }))
    .filter((item): item is { hint: NonNullable<TemplateSchema['generationContract']>['relationshipHints'][number]; from: ParsedItemPath; to: ParsedItemPath } => (
      Boolean(item.from && item.to && item.from.arrayPath === field.path && item.to.arrayPath === field.path)
    ));
  const inferred = inferRelationshipsForField(field);
  const seen = new Set<string>();
  return [...explicit, ...inferred].filter((item) => {
    const key = `${item.hint.kind}:${item.hint.from}:${item.hint.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function inferRelationshipsForField(field: TemplateFieldSummary) {
  const identityKey = inferIdentityItemKey(field);
  if (!identityKey) return [];
  return (field.itemSchema ?? []).flatMap((item) => {
    if (item.path === identityKey || item.valueType !== 'string') return [];
    const kind = inferRelationshipKindFromItemPath(item.path);
    if (!kind) return [];
    const hint = {
      kind,
      from: `${field.path}[].${item.path}`,
      to: `${field.path}[].${identityKey}`,
      meaning: `The ${item.path} field references another ${identityKey} value in the same list.`,
    } as const;
    const from = parseArrayItemPath(hint.from);
    const to = parseArrayItemPath(hint.to);
    return from && to ? [{ hint, from, to }] : [];
  });
}

function inferIdentityItemKey(field: TemplateFieldSummary): string | undefined {
  const items = field.itemSchema ?? [];
  return items.find((item) => /^id$/i.test(item.path))?.path
    ?? items.find((item) => /(^|_|\.)id$/i.test(item.path) && item.valueType === 'string')?.path
    ?? items.find((item) => item.valueType === 'string')?.path;
}

function inferRelationshipKindFromItemPath(path: string): 'sequence' | 'branch' | undefined {
  if (/prev|previous|back|backward/i.test(path)) return 'sequence';
  if (/next|forward/i.test(path)) return 'sequence';
  if (/^(yes|no)$/i.test(path) || /branch|choice/i.test(path)) return 'branch';
  return undefined;
}

function isReverseRelationship(relationship: ReturnType<typeof relationshipsFor>[number]): boolean {
  const text = `${relationship.from.itemPath} ${relationship.hint.meaning}`.toLowerCase();
  return /prev|previous|back|backward|reverse/.test(text);
}

function isForwardRelationship(relationship: ReturnType<typeof relationshipsFor>[number]): boolean {
  return !isReverseRelationship(relationship);
}

function isSequenceForwardRelationship(relationship: ReturnType<typeof relationshipsFor>[number]): boolean {
  if (relationship.hint.kind === 'branch') return false;
  return /next|forward/i.test(`${relationship.from.itemPath} ${relationship.hint.meaning}`);
}

function identityKeyFor(field: TemplateFieldSummary | null, templateSchema?: TemplateSchema): string {
  const relationship = relationshipsFor(field, templateSchema).find((item) => item.to.itemPath);
  if (relationship) return relationship.to.itemPath;
  return itemSchemaFor(field)[0]?.path ?? 'id';
}

function stringValue(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

function rowId(row: DialogRow, index: number, identityKey: string): string {
  return stringValue(row[identityKey]) || `row_${index + 1}`;
}

function fieldHintFor(templateSchema: TemplateSchema | undefined, path: string) {
  return templateSchema?.generationContract?.fieldHints?.find((hint) => hint.path === path);
}

function longTextField(field: TemplateFieldSummary, itemPath: string, current: unknown, templateSchema?: TemplateSchema): boolean {
  const hint = fieldHintFor(templateSchema, `${field.path}[].${itemPath}`);
  const text = `${hint?.meaning ?? ''} ${hint?.generationUse ?? ''}`.toLowerCase();
  return stringValue(current).length > 80 || /prompt|dialog|line|text|message|description|speech|player-facing/.test(text);
}

function DialogPageNode({ data }: NodeProps<Node<DialogPageNodeData>>) {
  return (
    <div className={`w-[200px] rounded-md border bg-steel-850 px-2.5 py-2 shadow-lg ${data.selected ? 'border-pulse' : data.isolated ? 'border-amber-500/80' : 'border-steel-600'}`}>
      <Handle type="target" position={Position.Left} className="!bg-pulse" />
      <div className="flex items-start justify-between gap-1.5">
        <p className="text-xs font-semibold text-steel-100 truncate">{data.title}</p>
        <div className="flex flex-wrap gap-1 justify-end">
          {data.badges.slice(0, 2).map((badge) => (
            <span key={badge} className="text-[9px] text-steel-200 bg-steel-700 rounded px-1 py-0.5 truncate max-w-16">
              {badge}
            </span>
          ))}
          {data.isolated && (
            <span className="text-[9px] text-amber-200 bg-amber-950/70 border border-amber-700/60 rounded px-1 py-0.5">
              Unlinked
            </span>
          )}
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-steel-300 line-clamp-2 whitespace-pre-wrap">{data.prompt || 'No prompt text'}</p>
      <Handle type="source" position={Position.Right} className="!bg-pulse" />
    </div>
  );
}

function DialogRelationshipEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  data,
}: EdgeProps<Edge<unknown, 'dialogRelationship'>>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const edgeData = data as DialogEdgeData | undefined;

  return (
    <>
      {edgeData?.bidirectional && (
        <defs>
          <marker id={`start-${id}`} markerWidth="12" markerHeight="12" refX="2" refY="6" orient="auto" markerUnits="strokeWidth">
            <path d="M10,2 L2,6 L10,10" fill="none" stroke="#93f8ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        </defs>
      )}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          markerStart: edgeData?.bidirectional ? `url(#start-${id})` : undefined,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded border border-cyan-300 bg-steel-850 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-200"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          {edgeData?.bidirectional ? 'next / prev' : edgeData?.label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = {
  dialogPage: DialogPageNode,
} satisfies NodeTypes;

const edgeTypes = {
  dialogRelationship: DialogRelationshipEdge,
};

function layoutDialogGraph(nodes: Node<DialogPageNodeData>[], edges: Edge[]) {
  if (edges.length > 0) return getLayoutedElements(nodes, edges, 'LR');

  return {
    nodes: nodes.map((node, index) => ({
      ...node,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      position: {
        x: index * 260,
        y: 120,
      },
    })),
    edges,
  };
}

function collapseReciprocalEdges(edges: Edge[]): Edge[] {
  const consumed = new Set<string>();
  const byEndpoints = new Map<string, Edge>();

  for (const edge of edges) {
    byEndpoints.set(`${edge.source}->${edge.target}`, edge);
  }

  return edges.flatMap((edge) => {
    if (consumed.has(edge.id)) return [];
    const reverse = byEndpoints.get(`${edge.target}->${edge.source}`);
    const edgeData = edge.data as DialogEdgeData | undefined;
    const reverseData = reverse?.data as DialogEdgeData | undefined;

    if (
      reverse
      && reverse.id !== edge.id
      && edgeData
      && reverseData
      && isOppositeSequenceFields(edgeData.sourceField, reverseData.sourceField)
    ) {
      consumed.add(edge.id);
      consumed.add(reverse.id);
      const forward = /next|forward/i.test(edgeData.sourceField) ? edge : reverse;
      const backward = forward === edge ? reverse : edge;
      const forwardData = forward.data as DialogEdgeData;
      const backwardData = backward.data as DialogEdgeData;
      return [{
        ...forward,
        id: `${forward.source}-sequence-${forward.target}`,
        label: 'next / prev',
        type: 'dialogRelationship',
        data: {
          ...forwardData,
          reverseSourceIndex: backwardData.sourceIndex,
          reverseSourceField: backwardData.sourceField,
          bidirectional: true,
          label: 'next / prev',
        },
      }];
    }

    consumed.add(edge.id);
    return [{
      ...edge,
      type: 'dialogRelationship',
      data: {
        ...(edge.data as DialogEdgeData),
        label: edgeData?.label ?? String(edge.label ?? ''),
      },
    }];
  });
}

function isOppositeSequenceFields(a: string, b: string): boolean {
  const aForward = /next|forward/i.test(a);
  const bForward = /next|forward/i.test(b);
  const aReverse = /prev|previous|back|backward/i.test(a);
  const bReverse = /prev|previous|back|backward/i.test(b);
  return (aForward && bReverse) || (aReverse && bForward);
}

function repairReciprocalSequenceRows(
  rows: DialogRow[],
  relationships: ReturnType<typeof relationshipsFor>,
  identityKey: string,
): DialogRow[] | null {
  if (rows.length <= 1) return null;
  const idToIndex = new Map(rows.map((row, index) => [rowId(row, index, identityKey), index]));
  let changed = false;
  const repaired = rows.map((row) => ({ ...row }));

  for (const relationship of relationships) {
    if (!isSequenceForwardRelationship(relationship)) continue;
    const reverseRelationship = relationships.find((candidate) => (
      candidate !== relationship
      && candidate.to.itemPath === relationship.to.itemPath
      && isReverseRelationship(candidate)
    ));
    if (!reverseRelationship) continue;

    rows.forEach((row, sourceIndex) => {
      const sourceId = rowId(row, sourceIndex, identityKey);
      const targetId = stringValue(row[relationship.from.itemPath]);
      if (!targetId || !idToIndex.has(targetId)) return;
      const targetIndex = idToIndex.get(targetId);
      if (targetIndex === undefined) return;
      const targetRow = repaired[targetIndex];
      const currentReverse = stringValue(targetRow[reverseRelationship.from.itemPath]);
      if (currentReverse && idToIndex.has(currentReverse)) return;
      targetRow[reverseRelationship.from.itemPath] = sourceId;
      changed = true;
    });
  }

  return changed ? repaired : null;
}

export function DialogFlowEditorDialog({
  isOpen,
  field,
  templateSchema,
  value,
  onClose,
  onChange,
}: DialogFlowEditorDialogProps) {
  const rows = React.useMemo(() => normalizeRows(value), [value]);
  const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = React.useState(false);
  const relationships = React.useMemo(() => relationshipsFor(field, templateSchema), [field, templateSchema]);
  const identityKey = React.useMemo(() => identityKeyFor(field, templateSchema), [field, templateSchema]);
  const itemSchema = itemSchemaFor(field);
  const reactFlowInstanceRef = React.useRef<ReactFlowInstance | null>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    setSelectedIndex(null);
    setIsInspectorOpen(false);
  }, [field?.path, isOpen]);

  // The inspector panel resizes the canvas without moving the camera — re-fit
  // so the graph recentres into whatever width is actually left, instead of
  // leaving nodes sitting behind the newly-opened panel.
  React.useEffect(() => {
    const id = requestAnimationFrame(() => reactFlowInstanceRef.current?.fitView({ padding: 0.3, maxZoom: 1.1 }));
    return () => cancelAnimationFrame(id);
  }, [isInspectorOpen]);

  React.useEffect(() => {
    setSelectedIndex((index) => {
      if (index === null) return null;
      if (rows.length === 0) {
        setIsInspectorOpen(false);
        return null;
      }
      return Math.min(index, rows.length - 1);
    });
  }, [rows.length]);

  React.useEffect(() => {
    if (!isOpen) return;
    const repairedRows = repairReciprocalSequenceRows(rows, relationships, identityKey);
    if (repairedRows) onChange(repairedRows);
  }, [identityKey, isOpen, onChange, relationships, rows]);

  const updateRows = (nextRows: DialogRow[]) => onChange(nextRows);
  const updateRow = (index: number, updates: DialogRow) => {
    updateRows(rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...updates } : row));
  };
  const updateItem = (index: number, itemPath: string, nextValue: unknown) => {
    if (itemPath !== identityKey) {
      updateRow(index, { [itemPath]: nextValue });
      return;
    }

    const oldValue = rowId(rows[index] ?? {}, index, identityKey);
    const newValue = stringValue(nextValue).trim();
    if (!newValue) {
      toast.error('Page id cannot be empty');
      return;
    }
    const duplicate = rows.some((row, rowIndex) => rowIndex !== index && rowId(row, rowIndex, identityKey) === newValue);
    if (duplicate) {
      toast.error('Page ids must be unique');
      return;
    }

    updateRows(rows.map((row, rowIndex) => {
      const next = { ...row };
      if (rowIndex === index) next[itemPath] = newValue;
      for (const relationship of relationships) {
        if (stringValue(next[relationship.from.itemPath]) === oldValue) {
          next[relationship.from.itemPath] = newValue;
        }
      }
      return next;
    }));
  };

  const removeRow = (index: number) => {
    const removedId = rowId(rows[index] ?? {}, index, identityKey);
    const nextRows = rows
      .filter((_, rowIndex) => rowIndex !== index)
      .map((row) => {
        const next = { ...row };
        for (const relationship of relationships) {
          if (stringValue(next[relationship.from.itemPath]) === removedId) delete next[relationship.from.itemPath];
        }
        return next;
      });
    updateRows(nextRows);
  };

  const addRow = () => {
    const baseId = `page_${rows.length + 1}`;
    const existing = new Set(rows.map((row, index) => rowId(row, index, identityKey)));
    let nextId = baseId;
    let suffix = 2;
    while (existing.has(nextId)) {
      nextId = `${baseId}_${suffix}`;
      suffix += 1;
    }
    updateRows([...rows, Object.fromEntries(itemSchema.map((item) => [
      item.path,
      item.path === identityKey ? nextId : item.valueType === 'number' ? 0 : item.valueType === 'boolean' ? false : '',
    ]))]);
    setSelectedIndex(rows.length);
    setIsInspectorOpen(true);
  };

  const graph = React.useMemo(() => {
    const idToIndex = new Map(rows.map((row, index) => [rowId(row, index, identityKey), index]));
    const edgesForRows = relationships.flatMap((relationship) => rows.flatMap((row, index) => {
      const source = rowId(row, index, identityKey);
      const target = stringValue(row[relationship.from.itemPath]);
      if (!target || !idToIndex.has(target)) return [];
      return [{
        id: `${source}-${relationship.from.itemPath}-${target}`,
        source,
        target,
        label: relationship.from.itemPath,
        type: 'dialogRelationship',
        data: { sourceIndex: index, sourceField: relationship.from.itemPath, label: relationship.from.itemPath },
        animated: relationship.hint.kind === 'branch',
        className: '!stroke-pulse',
      }];
    }));
    const connectedIds = new Set(edgesForRows.flatMap((edge) => [edge.source, edge.target]));

    const nodes: Node<DialogPageNodeData>[] = rows.map((row, index) => {
      const title = rowId(row, index, identityKey);
      const promptField = itemSchema.find((item) => longTextField(field!, item.path, row[item.path], templateSchema))?.path;
      const badges = itemSchema
        .filter((item) => item.path !== identityKey && row[item.path] !== undefined && row[item.path] !== '')
        .filter((item) => item.valueType === 'boolean' ? Boolean(row[item.path]) : !longTextField(field!, item.path, row[item.path], templateSchema))
        .map((item) => `${item.label}: ${stringValue(row[item.path])}`);
      return {
        id: title,
        type: 'dialogPage',
        position: { x: index * 320, y: 0 },
        data: {
          title,
          prompt: promptField ? stringValue(row[promptField]) : '',
          badges,
          selected: selectedIndex === index,
          isolated: rows.length > 1 && !connectedIds.has(title),
        },
      };
    });

    const hintedEdges: Edge[] = collapseReciprocalEdges(edgesForRows);

    const inferredEdges = hintedEdges.length ? [] : rows.flatMap((row, index) => {
      const source = rowId(row, index, identityKey);
      return itemSchema.flatMap((item) => {
        if (item.path === identityKey || item.valueType !== 'string') return [];
        const target = stringValue(row[item.path]);
        if (!target || !idToIndex.has(target)) return [];
        return [{
          id: `${source}-${item.path}-${target}`,
          source,
          target,
          label: item.path,
          type: 'dialogRelationship',
          data: { sourceIndex: index, sourceField: item.path, label: item.path },
        }];
      });
    });

    return layoutDialogGraph(nodes, [...hintedEdges, ...inferredEdges]);
  }, [field, identityKey, itemSchema, relationships, rows, selectedIndex, templateSchema]);

  const [nodes, setNodes] = React.useState(graph.nodes);
  React.useEffect(() => setNodes(graph.nodes), [graph.nodes]);

  const onNodesChange = React.useCallback((changes: NodeChange[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const handleConnect = (connection: Connection) => {
    if (!connection.source || !connection.target) return;
    const relationship = relationships.find(isForwardRelationship) ?? relationships[0];
    if (!relationship) {
      toast.error('Add a relationship hint before connecting dialog pages');
      return;
    }
    const sourceIndex = rows.findIndex((row, index) => rowId(row, index, identityKey) === connection.source);
    if (sourceIndex === -1) return;
    const targetIndex = rows.findIndex((row, index) => rowId(row, index, identityKey) === connection.target);
    const reverseRelationship = isSequenceForwardRelationship(relationship) ? relationships.find((candidate) => (
      candidate !== relationship
      && candidate.to.itemPath === relationship.to.itemPath
      && isReverseRelationship(candidate)
    )) : undefined;

    updateRows(rows.map((row, index) => {
      if (index === sourceIndex) return { ...row, [relationship.from.itemPath]: connection.target };
      if (index === targetIndex && reverseRelationship) return { ...row, [reverseRelationship.from.itemPath]: connection.source };
      return row;
    }));
  };

  const handleEdgesDelete = (deletedEdges: Edge[]) => {
    let nextRows = rows;
    for (const edge of deletedEdges) {
      const sourceIndex = typeof edge.data?.sourceIndex === 'number' ? edge.data.sourceIndex : -1;
      const sourceField = typeof edge.data?.sourceField === 'string' ? edge.data.sourceField : '';
      const reverseSourceIndex = typeof edge.data?.reverseSourceIndex === 'number' ? edge.data.reverseSourceIndex : -1;
      const reverseSourceField = typeof edge.data?.reverseSourceField === 'string' ? edge.data.reverseSourceField : '';
      if (sourceIndex < 0 || !sourceField) continue;
      nextRows = nextRows.map((row, index) => {
        if (index !== sourceIndex && index !== reverseSourceIndex) return row;
        const next = { ...row };
        if (index === sourceIndex) delete next[sourceField];
        if (index === reverseSourceIndex && reverseSourceField) delete next[reverseSourceField];
        return next;
      });
    }
    updateRows(nextRows);
  };

  const selectedRow = selectedIndex === null ? undefined : rows[selectedIndex];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-steel-900 border-steel-700 text-steel-100 !max-w-7xl !h-[80vh] p-0 overflow-hidden !flex !flex-col !gap-0">
        <DialogHeader className="px-5 py-4 border-b border-steel-700 shrink-0 flex-row items-center justify-between gap-3">
          <div>
            <DialogTitle className="text-steel-100 text-lg">{field?.label ?? 'Dialog'} Flow</DialogTitle>
            <p className="text-steel-500 text-xs mt-0.5">{rows.length} page{rows.length === 1 ? '' : 's'}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={addRow}
              className="flex items-center gap-2 rounded-md border border-steel-600 bg-steel-800 hover:bg-steel-700 px-3 py-2 text-sm text-steel-100"
            >
              <Plus className="w-4 h-4" />
              Add page
            </button>
            <button
              type="button"
              onClick={() => {
                if (isInspectorOpen) { setIsInspectorOpen(false); return; }
                if (selectedIndex === null && rows.length > 0) setSelectedIndex(0);
                setIsInspectorOpen(true);
              }}
              className="flex items-center gap-2 rounded-md border border-steel-600 bg-steel-800 hover:bg-steel-700 px-3 py-2 text-sm text-steel-100"
            >
              {isInspectorOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
              Page details
            </button>
          </div>
        </DialogHeader>
        <div
          className="grid flex-1 min-h-0"
          style={{ gridTemplateColumns: isInspectorOpen ? 'minmax(0, 1fr) 400px' : 'minmax(0, 1fr)' }}
        >
          <div className="relative min-w-0">
            <ReactFlow
              nodes={nodes}
              edges={graph.edges}
              onNodesChange={onNodesChange}
              onConnect={handleConnect}
              onEdgesDelete={handleEdgesDelete}
              onNodeClick={(_, node) => {
                const index = rows.findIndex((row, rowIndex) => rowId(row, rowIndex, identityKey) === node.id);
                if (index >= 0) {
                  setSelectedIndex(index);
                  setIsInspectorOpen(true);
                }
              }}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onInit={(instance) => { reactFlowInstanceRef.current = instance; }}
              fitView
              fitViewOptions={{ padding: 0.3, maxZoom: 1.1 }}
              proOptions={{ hideAttribution: true }}
              className="bg-steel-950"
            >
              <Background variant={BackgroundVariant.Dots} color="#2a323b" gap={20} size={1.5} />
              <Controls className="!bg-steel-800 !border-steel-600 [&_button]:!bg-steel-800 [&_button]:!border-steel-600 [&_button]:!text-steel-200 hover:[&_button]:!bg-steel-700" />
            </ReactFlow>
          </div>
          {isInspectorOpen && (
          <aside className="border-l border-steel-700 bg-steel-900 overflow-y-auto">
            {selectedRow ? (
              <div className="min-h-full">
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-steel-700 bg-steel-900/95 backdrop-blur px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-steel-100">{rowId(selectedRow, selectedIndex, identityKey)}</p>
                    <p className="text-xs text-steel-500">{field?.path}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setIsInspectorOpen(false)}
                      className="p-2 text-steel-400 hover:text-steel-100 hover:bg-steel-800 rounded-lg"
                      title="Collapse details"
                    >
                      <PanelRightClose className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => selectedIndex !== null && removeRow(selectedIndex)}
                      className="p-2 text-steel-400 hover:text-red-300 hover:bg-red-950/30 rounded-lg"
                      title="Remove page"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="space-y-4 p-4">
                  {itemSchema.map((item) => {
                    const current = selectedRow[item.path];
                    const hint = fieldHintFor(templateSchema, `${field?.path}[].${item.path}`);
                    return (
                      <div key={item.path}>
                        <label className="block text-steel-400 text-xs uppercase tracking-wide mb-1">{item.label}</label>
                        {hint?.meaning && <p className="text-steel-500 text-xs mb-2">{hint.meaning}</p>}
                        {item.valueType === 'boolean' ? (
                          <label className="flex items-center gap-2 bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-sm text-steel-200">
                            <input
                              type="checkbox"
                              checked={Boolean(current)}
                              onChange={(event) => updateItem(selectedIndex, item.path, event.target.checked)}
                              className="accent-pulse"
                            />
                            Enabled
                          </label>
                        ) : longTextField(field!, item.path, current, templateSchema) ? (
                          <textarea
                            value={stringValue(current)}
                            onChange={(event) => updateItem(selectedIndex, item.path, event.target.value)}
                            rows={10}
                            className="w-full bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 text-sm focus:outline-none focus:border-pulse resize-y"
                          />
                        ) : (
                          <input
                            type={item.valueType === 'number' ? 'number' : 'text'}
                            value={stringValue(current)}
                            onChange={(event) => updateItem(selectedIndex, item.path, item.valueType === 'number' ? Number(event.target.value) || 0 : event.target.value)}
                            className="w-full bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 text-sm focus:outline-none focus:border-pulse"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-steel-500">Add a page to begin editing.</div>
            )}
          </aside>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
