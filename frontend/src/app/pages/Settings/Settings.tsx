import React from 'react';
import { GitHubSettingsCard } from './components/GitHubSettingsCard';

export function Settings() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="text-white text-2xl font-semibold">Settings</h1>
        <p className="text-zinc-400 text-sm mt-1">Manage your integrations and preferences</p>
      </div>
      <GitHubSettingsCard />
    </div>
  );
}
