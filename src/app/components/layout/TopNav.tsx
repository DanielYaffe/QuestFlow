import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Workflow, Home, Sparkles, PlayCircle, PlusCircle } from 'lucide-react';

export function TopNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Dashboard', icon: Home },
    { path: '/create', label: 'Create', icon: PlusCircle },
    { path: '/quest-builder', label: 'Quest Builder', icon: Workflow },
    { path: '/sprite-generator', label: 'Sprite Generator', icon: Sparkles },
    { path: '/sprite-animator', label: 'Sprite Animator', icon: PlayCircle },
  ];

  return (
    <nav className="bg-zinc-900 border-b border-zinc-800 px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-purple-600 p-2 rounded-lg">
            <Workflow className="w-5 h-5 text-white" />
          </div>
          <span className="text-white font-semibold">QuestFlow AI</span>
        </div>

        <div className="flex items-center gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-purple-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
