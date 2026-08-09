import React, { ReactNode } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const inputCls =
  'w-full bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 placeholder-steel-400 focus:outline-none focus:border-pulse text-sm';

export const labelCls = 'block text-steel-400 text-sm mb-1';

export const btnPrimaryCls =
  'flex items-center gap-2 px-4 py-2 bg-volt hover:brightness-95 disabled:opacity-50 text-steel-950 font-semibold rounded-lg transition-[filter] text-sm cursor-pointer';

export const btnSecondaryCls =
  'flex items-center gap-2 px-4 py-2 bg-steel-800 hover:bg-steel-700 text-steel-200 rounded-lg transition-colors text-sm cursor-pointer';

interface AdminDialogProps {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}

export function AdminDialog({ isOpen, title, subtitle, onClose, children, wide = false }: AdminDialogProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-[100]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-full ${wide ? 'max-w-2xl' : 'max-w-md'}`}
          >
            <div className="bg-steel-850 border border-steel-700 rounded-md shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
              <div className="flex items-start justify-between px-5 pt-5 pb-3 shrink-0">
                <div>
                  <h3 className="text-steel-100 font-semibold text-base">{title}</h3>
                  {subtitle && <p className="text-steel-400 text-xs mt-0.5">{subtitle}</p>}
                </div>
                <button onClick={onClose} className="text-steel-400 hover:text-steel-100 transition-colors cursor-pointer mt-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="px-5 pb-5 overflow-y-auto">{children}</div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/** Surfaces the API's own error message when it sent one — they are written to be read. */
export function apiError(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
    if (message) return message;
  }
  return fallback;
}

export function CategoryChip({ category }: { category: string }) {
  const palette: Record<string, string> = {
    pixel: 'bg-emerald-500/15 text-emerald-300',
    illustrated: 'bg-sky-500/15 text-sky-300',
    realistic: 'bg-amber-500/15 text-amber-300',
    raw: 'bg-steel-700 text-steel-300',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${palette[category] ?? 'bg-steel-700 text-steel-300'}`}>
      {category}
    </span>
  );
}
