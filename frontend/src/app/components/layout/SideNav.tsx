import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Workflow, Home, Sparkles, PlayCircle, PlusCircle, LogOut, Settings2, FolderKanban, BookOpen, Palette, ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useMe } from '../../hooks/useMe';
import { ProjectSwitcher } from './ProjectSwitcher';

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Home', icon: Home },
  { path: '/projects', label: 'Projects', icon: FolderKanban },
  { path: '/games', label: 'Games & KB', icon: BookOpen },
  { path: '/studio', label: 'Studio', icon: Palette },
  { path: '/create', label: 'Create', icon: PlusCircle },
  { path: '/quest-builder', label: 'Quest Builder', icon: Workflow },
  { path: '/sprite-generator', label: 'Sprites', icon: Sparkles },
  { path: '/sprite-animator', label: 'Animator', icon: PlayCircle },
  { path: '/settings', label: 'Settings', icon: Settings2 },
];

const ADMIN_ITEM = { path: '/admin', label: 'Admin', icon: ShieldCheck };

const PREFIX_MATCHED = ['/projects', '/games', '/quest-builder', '/studio', '/admin'];

export function SideNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const { isAdmin } = useMe();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isActive = (path: string) =>
    PREFIX_MATCHED.includes(path) ? location.pathname.startsWith(path) : location.pathname === path;

  return (
    <aside className="w-52 h-full shrink-0 bg-steel-900 border-r border-steel-700 flex flex-col">
      <div className="flex items-center gap-2.5 px-4 pt-5 pb-4">
        <div className="w-6 h-6 rounded bg-volt flex items-center justify-center shrink-0">
          <Workflow className="w-4 h-4 text-steel-950" />
        </div>
        <span className="text-steel-100 font-semibold text-sm tracking-wide">QuestFlow</span>
      </div>

      <div className="px-2.5 pb-3">
        <ProjectSwitcher />
      </div>

      <nav className="flex-1 px-2.5 flex flex-col gap-0.5 overflow-y-auto">
        {[...NAV_ITEMS, ...(isAdmin ? [ADMIN_ITEM] : [])].map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer ${
                active
                  ? 'bg-steel-800 text-steel-100 shadow-[inset_2px_0_0_0_#f5d90a]'
                  : 'text-steel-400 hover:text-steel-100 hover:bg-steel-800/60'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-volt' : ''}`} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="px-2.5 py-3 border-t border-steel-700">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-steel-400 hover:text-steel-100 hover:bg-steel-800/60 transition-colors cursor-pointer"
          title="Sign out"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
