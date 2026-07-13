import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronDown, FolderKanban, Plus, Settings2 } from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { ProjectFormDialog } from '../shared/ProjectFormDialog';

export function ProjectSwitcher() {
  const navigate = useNavigate();
  const { projects, activeProject, setActiveProject, createProject } = useProject();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const handleSelect = (id: string) => {
    setActiveProject(id);
    setOpen(false);
  };

  const handleCreate = async (name: string) => {
    await createProject(name);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors max-w-[220px]"
        title="Switch project"
      >
        <FolderKanban className="w-4 h-4 text-purple-400 shrink-0" />
        <span className="text-sm truncate">{activeProject?.name ?? 'Select project'}</span>
        <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-64 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="max-h-72 overflow-y-auto py-1">
            {projects.map((p) => {
              const isActive = p._id === activeProject?._id;
              return (
                <button
                  key={p._id}
                  onClick={() => handleSelect(p._id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                    isActive ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <Check className={`w-4 h-4 shrink-0 ${isActive ? 'text-purple-400' : 'text-transparent'}`} />
                  <span className="truncate">{p.name}</span>
                </button>
              );
            })}
          </div>
          <div className="border-t border-zinc-800">
            <button
              onClick={() => { setOpen(false); setCreateOpen(true); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              <Plus className="w-4 h-4 text-purple-400" />
              <span>New project</span>
            </button>
            <button
              onClick={() => { setOpen(false); navigate('/projects'); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              <Settings2 className="w-4 h-4 text-zinc-400" />
              <span>Manage projects</span>
            </button>
          </div>
        </div>
      )}

      <ProjectFormDialog
        isOpen={createOpen}
        mode="create"
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />
    </div>
  );
}
