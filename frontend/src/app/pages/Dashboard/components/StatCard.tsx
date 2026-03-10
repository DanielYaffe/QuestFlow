import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string;
  subtext: string;
  icon: LucideIcon;
  iconColor: string;
}

export function StatCard({ label, value, subtext, icon: Icon, iconColor }: StatCardProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-zinc-400 text-sm">{label}</span>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <p className="text-white text-3xl">{value}</p>
      <p className="text-zinc-500 text-xs mt-1">{subtext}</p>
    </div>
  );
}
