import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Server, ServerOff } from 'lucide-react';
import { toast } from 'sonner';
import {
  AdminSpriteStyle,
  AdminLora,
  AdminCheckpoint,
  AdminUser,
  ComfyModels,
  WorkflowPresetInfo,
  getAdminStyles,
  getAdminLoras,
  getAdminCheckpoints,
  getAdminUsers,
  getComfyModels,
  getWorkflowPresets,
} from '../../api/adminApi';
import { useMe } from '../../hooks/useMe';
import { StylesTab } from './components/StylesTab';
import { LoraRegistryTab, CheckpointRegistryTab } from './components/ModelRegistryTab';
import { UsersTab } from './components/UsersTab';

type Tab = 'styles' | 'loras' | 'checkpoints' | 'users';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'styles', label: 'Styles' },
  { id: 'loras', label: 'LoRAs' },
  { id: 'checkpoints', label: 'Checkpoints' },
  { id: 'users', label: 'Users' },
];

export function AdminPage() {
  const { me } = useMe();
  const [tab, setTab] = useState<Tab>('styles');
  const [styles, setStyles] = useState<AdminSpriteStyle[]>([]);
  const [presets, setPresets] = useState<WorkflowPresetInfo[]>([]);
  const [loras, setLoras] = useState<AdminLora[]>([]);
  const [checkpoints, setCheckpoints] = useState<AdminCheckpoint[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [comfy, setComfy] = useState<ComfyModels | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [stylesData, presetsData, lorasData, checkpointsData, usersData, comfyData] = await Promise.all([
        getAdminStyles(),
        getWorkflowPresets(),
        getAdminLoras(),
        getAdminCheckpoints(),
        getAdminUsers(),
        getComfyModels(),
      ]);
      setStyles(stylesData);
      setPresets(presetsData);
      setLoras(lorasData);
      setCheckpoints(checkpointsData);
      setUsers(usersData);
      setComfy(comfyData);
    } catch {
      toast.error('Failed to load admin data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-10 pb-16">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-steel-100 text-2xl font-semibold">Admin</h1>
            <p className="text-steel-400 text-sm mt-1">Manage sprite styles, model registries and user roles</p>
          </div>
          <div className="flex items-center gap-3">
            {comfy && (
              comfy.reachable ? (
                <span className="text-emerald-400 text-xs flex items-center gap-1.5 bg-emerald-500/10 px-2.5 py-1.5 rounded-md" title={`${comfy.checkpoints.length} checkpoints, ${comfy.loras.length} LoRAs installed`}>
                  <Server className="w-3.5 h-3.5" /> ComfyUI connected
                </span>
              ) : (
                <span className="text-amber-400 text-xs flex items-center gap-1.5 bg-amber-500/10 px-2.5 py-1.5 rounded-md" title="File validation is unavailable while ComfyUI is offline">
                  <ServerOff className="w-3.5 h-3.5" /> ComfyUI offline
                </span>
              )
            )}
            <button
              onClick={() => { setLoading(true); refresh(); }}
              className="text-steel-400 hover:text-steel-100 transition-colors cursor-pointer"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="flex gap-1 mb-6 border-b border-steel-700">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm transition-colors cursor-pointer -mb-px border-b-2 ${
                tab === t.id
                  ? 'text-steel-100 border-volt'
                  : 'text-steel-400 border-transparent hover:text-steel-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-steel-850 border border-steel-700 rounded-md h-16 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {tab === 'styles' && (
              <StylesTab
                styles={styles}
                presets={presets}
                registryLoras={loras}
                registryCheckpoints={checkpoints}
                comfy={comfy}
                onChanged={refresh}
              />
            )}
            {tab === 'loras' && <LoraRegistryTab loras={loras} comfy={comfy} onChanged={refresh} />}
            {tab === 'checkpoints' && <CheckpointRegistryTab checkpoints={checkpoints} comfy={comfy} onChanged={refresh} />}
            {tab === 'users' && <UsersTab users={users} meId={me?._id ?? null} onChanged={refresh} />}
          </>
        )}
      </div>
    </div>
  );
}
