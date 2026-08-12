import React from 'react';
import { GitHubSettingsCard } from './components/GitHubSettingsCard';
import { QuestTemplateSettingsCard } from './components/QuestTemplateSettingsCard';

export function Settings() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-10 pb-16">
        <div className="mb-8">
          <h1 className="text-steel-100 text-2xl font-semibold">Settings</h1>
          <p className="text-steel-400 text-sm mt-1">Manage your integrations and preferences</p>
        </div>
        <div className="space-y-6">
          <GitHubSettingsCard />
          <QuestTemplateSettingsCard />
        </div>
      </div>
    </div>
  );
}
