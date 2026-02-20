import React from 'react';
import { LucideIcon } from 'lucide-react';

interface QuickActionCardProps {
  label: string;
  description: string;
  cta: string;
  icon: LucideIcon;
  gradient: string;
  shadowColor: string;
  textColor: string;
  onClick: () => void;
}

export function QuickActionCard({
  label,
  description,
  cta,
  icon: Icon,
  gradient,
  shadowColor,
  textColor,
  onClick,
}: QuickActionCardProps) {
  return (
    <button
      onClick={onClick}
      className={`group ${gradient} rounded-xl p-8 text-left hover:shadow-lg ${shadowColor} transition-all`}
    >
      <div className="bg-white/10 backdrop-blur-sm w-14 h-14 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
        <Icon className="w-8 h-8 text-white" />
      </div>
      <h3 className="text-white text-lg mb-2">{label}</h3>
      <p className={`${textColor} text-sm mb-4`}>{description}</p>
      <div className="flex items-center text-white text-sm">
        <span>{cta}</span>
        <span className="ml-2 group-hover:ml-4 transition-all">→</span>
      </div>
    </button>
  );
}
