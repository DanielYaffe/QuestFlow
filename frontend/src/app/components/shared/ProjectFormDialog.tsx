import React, { useEffect, useState } from 'react';
import { FolderKanban, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

interface ProjectFormDialogProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialName?: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}

export function ProjectFormDialog({ isOpen, mode, initialName = '', onClose, onSubmit }: ProjectFormDialogProps) {
  const [name, setName] = useState(initialName);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) setName(initialName);
  }, [isOpen, initialName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-steel-850 border-steel-700 text-steel-100 max-w-md w-full">
        <DialogHeader>
          <DialogTitle className="text-steel-100 text-lg flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-pulse" />
            {mode === 'create' ? 'New Project' : 'Rename Project'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-steel-400 text-sm mb-1">Project name</label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Project"
              className="w-full bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 placeholder-steel-400 focus:outline-none focus:border-pulse text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-steel-800 hover:bg-steel-700 text-steel-200 rounded-lg transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-volt hover:brightness-95 disabled:opacity-50 text-steel-950 font-semibold rounded-lg transition-colors text-sm"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'create' ? 'Create' : 'Save'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
