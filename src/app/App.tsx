import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout';
import { Dashboard } from './pages/Dashboard/Dashboard';
import { QuestBuilder } from './pages/QuestBuilder/QuestBuilder';
import { QuestCreate } from './pages/QuestCreate/QuestCreate';
import { SpriteGenerator } from './pages/SpriteGenerator/SpriteGenerator';
import { SpriteAnimator } from './pages/SpriteAnimator/SpriteAnimator';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/quest-builder" element={<QuestBuilder />} />
          <Route path="/create" element={<QuestCreate />} />
          <Route path="/sprite-generator" element={<SpriteGenerator />} />
          <Route path="/sprite-animator" element={<SpriteAnimator />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
