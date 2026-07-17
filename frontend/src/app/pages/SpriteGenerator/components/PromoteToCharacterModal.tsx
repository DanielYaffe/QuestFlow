import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Loader2, Skull, User, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { SpriteRecord } from '../../../api/spriteApi';
import { listProjects, ProjectRecord } from '../../../api/projectApi';
import { createCharacter, CharacterKind } from '../../../api/characterApi';

interface PromoteToCharacterModalProps {
  sprite: SpriteRecord;
  onClose: () => void;
}

/**
 * Promote a generated sprite into a project Character. The sprite's underlying
 * S3 key seeds the character's candidate grid + canonical sprite, so the
 * Character pages and the sprite-iteration loop (Phase 2) can re-presign it.
 */
export function PromoteToCharacterModal({ sprite, onClose }: PromoteToCharacterModalProps) {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [projectId, setProjectId] = useState('');
  const [name, setName] = useState(sprite.userPrompt.slice(0, 60));
  const [kind, setKind] = useState<CharacterKind>('monster');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listProjects()
      .then((list) => {
        setProjects(list);
        // Default to the Inbox so promotion always has a home
        const inbox = list.find((p) => p.isInbox) ?? list[0];
        if (inbox) setProjectId(inbox._id);
      })
      .catch(() => toast.error('Failed to load projects'))
      .finally(() => setLoading(false));
  }, []);

  const submit = async () => {
    if (!name.trim() || !projectId || saving || !sprite.imageKey) return;
    setSaving(true);
    try {
      const created = await createCharacter({
        name: name.trim(),
        kind,
        projectId,
        appearance: sprite.userPrompt,
        assets: {
          snappedSpriteS3Key: sprite.imageKey,
          rawSpriteCandidates: [sprite.imageKey],
        },
      });
      toast.success('Promoted to Character', {
        action: {
          label: 'Open in Studio',
          onClick: () => navigate(`/studio/${created._id}`),
        },
      });
      onClose();
    } catch {
      toast.error('Failed to promote sprite');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-steel-850 border border-steel-600 rounded-md max-w-md w-full p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-pulse" />
            <h2 className="text-steel-100 font-semibold text-base">Promote to Character</h2>
          </div>
          <button onClick={onClose} className="text-steel-400 hover:text-steel-100 transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-lg bg-steel-800 overflow-hidden flex items-center justify-center shrink-0">
            <img src={sprite.imageUrl} alt={sprite.userPrompt} className="w-full h-full object-contain" />
          </div>
          <p className="text-steel-400 text-xs leading-relaxed">{sprite.userPrompt}</p>
        </div>

        {!sprite.imageKey && (
          <p className="text-amber-400 text-xs">This sprite can't be promoted (missing source image).</p>
        )}

        <div className="grid grid-cols-2 gap-2">
          {(['monster', 'npc'] as CharacterKind[]).map((k) => {
            const Icon = k === 'monster' ? Skull : User;
            return (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                  kind === k ? 'border-pulse bg-steel-800 text-pulse' : 'border-steel-600 text-steel-400 hover:border-steel-500'
                }`}
              >
                <Icon className="w-4 h-4" />
                {k === 'monster' ? 'Monster' : 'NPC'}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-steel-400 text-xs uppercase tracking-wide">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            className="bg-steel-800 border border-steel-600 rounded-lg px-3 py-2.5 text-sm text-steel-100 focus:outline-none focus:border-pulse"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-steel-400 text-xs uppercase tracking-wide">Project</label>
          {loading ? (
            <div className="flex items-center gap-2 text-steel-400 text-sm py-2"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
          ) : (
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="bg-steel-800 border border-steel-600 rounded-lg px-3 py-2.5 text-sm text-steel-100 focus:outline-none focus:border-pulse"
            >
              {projects.map((p) => (
                <option key={p._id} value={p._id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-steel-800 hover:bg-steel-700 text-steel-200 rounded-lg text-sm transition-colors">Cancel</button>
          <button
            onClick={submit}
            disabled={!name.trim() || !projectId || saving || !sprite.imageKey}
            className="flex-1 px-4 py-2.5 bg-volt hover:brightness-95 disabled:bg-steel-700 disabled:text-steel-400 text-steel-950 font-semibold rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Promote
          </button>
        </div>
      </div>
    </div>
  );
}
