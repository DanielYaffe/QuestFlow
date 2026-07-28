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
        className="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-steel-850 border border-steel-700 text-steel-200 hover:bg-steel-800 transition-colors cursor-pointer"
        title="Switch project"
      >
        <FolderKanban className="w-4 h-4 text-pulse shrink-0" />
        <span className="text-sm truncate">{activeProject?.name ?? 'Select project'}</span>
        <ChevronDown className="w-4 h-4 text-steel-400 shrink-0 ml-auto" />
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-64 bg-steel-850 border border-steel-700 rounded-md shadow-xl z-50 overflow-hidden">
          <div className="max-h-72 overflow-y-auto py-1">
            {projects.map((p) => {
              const isActive = p._id === activeProject?._id;
              return (
                <button
                  key={p._id}
                  onClick={() => handleSelect(p._id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors cursor-pointer ${
                    isActive ? 'bg-steel-800 text-steel-100' : 'text-steel-200 hover:bg-steel-800'
                  }`}
                >
                  <Check className={`w-4 h-4 shrink-0 ${isActive ? 'text-volt' : 'text-transparent'}`} />
                  <span className="truncate">{p.name}</span>
                </button>
              );
            })}
          </div>
          <div className="border-t border-steel-700">
            <button
              onClick={() => { setOpen(false); setCreateOpen(true); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-steel-200 hover:bg-steel-800 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4 text-pulse" />
              <span>New project</span>
            </button>
            <button
              onClick={() => { setOpen(false); navigate('/projects'); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-steel-200 hover:bg-steel-800 transition-colors cursor-pointer"
            >
              <Settings2 className="w-4 h-4 text-steel-400" />
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
