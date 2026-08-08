import React, { useMemo, useState } from 'react';
import {
  RefreshCw, Box, Layers, Pencil, Plus, ExternalLink, AlertTriangle, PackageX,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  AdminCheckpoint,
  AdminLora,
  RunpodManifest,
  ManifestEndpoint,
  LORA_ENDPOINT_KEY,
  manifestCheckpoints,
  manifestLoras,
  reloadManifest,
} from '../../../api/adminApi';
import { CheckpointMetadataDialog } from './CheckpointMetadataDialog';
import { apiError } from './ui';

// ---------------------------------------------------------------------------
// What is actually deployed.
//
// The manifest is the authority: each endpoint is a Docker image with exactly
// one checkpoint baked in, and only sdxl-lora contains LoRA files. Showing them
// grouped this way makes the constraint visible instead of only enforcing it
// when a style fails to save.
//
// The registries decorate this view. They never decide what exists.
// ---------------------------------------------------------------------------

interface Props {
  manifest: RunpodManifest | null;
  checkpoints: AdminCheckpoint[];
  loras: AdminLora[];
  onChanged: () => void;
}

export function EndpointsTab({ manifest, checkpoints, loras, onChanged }: Props) {
  const [reloading, setReloading] = useState(false);
  const [editingFilename, setEditingFilename] = useState<string | null>(null);

  const checkpointBy = useMemo(
    () => new Map(checkpoints.map((c) => [c.filename, c])),
    [checkpoints],
  );
  const loraBy = useMemo(() => new Map(loras.map((l) => [l.filename, l])), [loras]);

  // Metadata for files that are in no image — usually the rebuild happened but
  // the manifest was never regenerated, which is the step that gets forgotten.
  const orphans = useMemo(() => {
    if (!manifest) return { checkpoints: [] as AdminCheckpoint[], loras: [] as AdminLora[] };
    const deployedCheckpoints = new Set(manifestCheckpoints(manifest));
    const deployedLoras = new Set(manifestLoras(manifest));
    return {
      checkpoints: checkpoints.filter((c) => !deployedCheckpoints.has(c.filename)),
      loras: loras.filter((l) => !deployedLoras.has(l.filename)),
    };
  }, [manifest, checkpoints, loras]);

  const onReload = async () => {
    setReloading(true);
    try {
      const fresh = await reloadManifest();
      toast.success(`Manifest ${fresh.version} loaded from ${fresh.source}`);
      onChanged();
    } catch (err) {
      toast.error(apiError(err, 'Failed to refetch the manifest'));
    } finally {
      setReloading(false);
    }
  };

  if (!manifest) {
    return (
      <p className="text-steel-500 text-sm text-center py-10">
        No manifest loaded — the backend could not read one at boot.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-4 gap-4">
        <p className="text-steel-400 text-sm">
          What is baked into the deployed images. Manifest <span className="text-steel-200">{manifest.version}</span>,
          built {new Date(manifest.builtAt).toLocaleString()}, loaded from {manifest.source}.
        </p>
        <button
          onClick={onReload}
          disabled={reloading}
          className="flex items-center gap-2 px-3 py-2 bg-steel-800 hover:bg-steel-700 disabled:opacity-50 text-steel-200 rounded-lg transition-colors text-sm cursor-pointer shrink-0"
          title="Refetch the manifest from its hosted URL without redeploying"
        >
          <RefreshCw className={`w-4 h-4 ${reloading ? 'animate-spin' : ''}`} /> Refetch
        </button>
      </div>

      <div className="space-y-3">
        {Object.entries(manifest.endpoints).map(([key, endpoint]) => (
          <EndpointCard
            key={key}
            endpointKey={key}
            endpoint={endpoint}
            checkpoint={checkpointBy.get(endpoint.checkpoint) ?? null}
            loraBy={loraBy}
            onEditCheckpoint={() => setEditingFilename(endpoint.checkpoint)}
          />
        ))}
      </div>

      {(orphans.checkpoints.length > 0 || orphans.loras.length > 0) && (
        <div className="mt-6 border border-amber-500/30 bg-amber-500/5 rounded-md px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <PackageX className="w-4 h-4 text-amber-400" />
            <span className="text-amber-300 text-sm font-medium">Registered but not deployed</span>
          </div>
          <p className="text-steel-400 text-xs mb-2">
            These have details saved but are in no image in manifest {manifest.version}. Either the image was never
            rebuilt with them, or it was and the manifest was not regenerated.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {[...orphans.checkpoints.map((c) => c.filename), ...orphans.loras.map((l) => l.filename)].map((f) => (
              <code key={f} className="text-steel-300 text-xs bg-steel-800 px-2 py-0.5 rounded">{f}</code>
            ))}
          </div>
        </div>
      )}

      <CheckpointMetadataDialog
        isOpen={editingFilename !== null}
        onClose={() => setEditingFilename(null)}
        onSaved={onChanged}
        checkpoint={editingFilename ? checkpointBy.get(editingFilename) ?? null : null}
        filename={editingFilename ?? ''}
      />
    </div>
  );
}

function EndpointCard({
  endpointKey, endpoint, checkpoint, loraBy, onEditCheckpoint,
}: {
  endpointKey: string;
  endpoint: ManifestEndpoint;
  checkpoint: AdminCheckpoint | null;
  loraBy: Map<string, AdminLora>;
  onEditCheckpoint: () => void;
}) {
  const carriesLoras = endpointKey === LORA_ENDPOINT_KEY;

  return (
    <div className="bg-steel-850 border border-steel-700 rounded-md overflow-hidden">
      <div className="px-4 py-3 border-b border-steel-700 flex items-center gap-3">
        <Box className="w-4 h-4 text-steel-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-steel-100 text-sm font-medium">{endpointKey}</span>
            {carriesLoras && (
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-sky-500/15 text-sky-300">
                carries LoRAs
              </span>
            )}
          </div>
          <div className="text-steel-500 text-xs truncate mt-0.5">
            {endpoint.image} · endpoint {endpoint.endpoint_id}
          </div>
        </div>
      </div>

      <div className="px-4 py-3">
        <div className="text-steel-500 text-xs uppercase tracking-wide mb-1.5">Checkpoint</div>
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-steel-500 shrink-0" />
          <div className="flex-1 min-w-0">
            {checkpoint ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-steel-100 text-sm">{checkpoint.displayName}</span>
                  <span className="text-steel-500 text-xs">{checkpoint.baseModel}</span>
                </div>
                <div className="text-steel-400 text-xs truncate">
                  {endpoint.checkpoint} · {checkpoint.source}
                </div>
              </>
            ) : (
              <>
                <span className="text-steel-100 text-sm">{endpoint.checkpoint}</span>
                <div className="text-steel-500 text-xs">no details saved</div>
              </>
            )}
          </div>
          {checkpoint?.sourceUrl && (
            <a href={checkpoint.sourceUrl} target="_blank" rel="noreferrer" className="text-steel-400 hover:text-steel-100" title="Open source page">
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <button
            onClick={onEditCheckpoint}
            className="text-steel-400 hover:text-steel-100 cursor-pointer shrink-0"
            title={checkpoint ? 'Edit details' : 'Add details'}
          >
            {checkpoint ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          </button>
        </div>

        <div className="text-steel-500 text-xs uppercase tracking-wide mt-4 mb-1.5">
          LoRAs {endpoint.loras.length > 0 && <span className="text-steel-600">({endpoint.loras.length})</span>}
        </div>
        {endpoint.loras.length === 0 ? (
          <p className="text-steel-500 text-xs">
            This image contains no LoRA files
            {!carriesLoras && <> — pairing a style on <code className="text-steel-400">{endpointKey}</code> with a LoRA is rejected</>}.
          </p>
        ) : (
          <div className="space-y-1.5">
            {endpoint.loras.map((filename) => {
              const meta = loraBy.get(filename);
              return (
                <div key={filename} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-steel-200 text-sm truncate">{meta?.displayName ?? filename}</span>
                      {meta?.triggerWord && (
                        <code className="text-volt text-xs bg-steel-800 px-1.5 py-0.5 rounded shrink-0">
                          {meta.triggerWord}
                        </code>
                      )}
                      {!meta && (
                        <span className="text-amber-400 text-xs flex items-center gap-1 shrink-0" title="Deployed but no details saved — add it in the LoRAs tab to get a trigger word and default strengths in the style editor">
                          <AlertTriangle className="w-3 h-3" /> no details
                        </span>
                      )}
                    </div>
                    {meta && (
                      <div className="text-steel-500 text-xs truncate">
                        {filename} · {meta.defaultStrength} / {meta.defaultStrengthClip}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
