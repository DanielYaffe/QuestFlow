import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { MainLayout } from './layouts/MainLayout';
import { Login } from './pages/Login/Login';
import { AuthCallback } from './pages/AuthCallback/AuthCallback';
import { Dashboard } from './pages/Dashboard/Dashboard';
import { QuestBuilder } from './pages/QuestBuilder/QuestBuilder';
import { QuestCreate } from './pages/QuestCreate/QuestCreate';
import { SpriteGenerator } from './pages/SpriteGenerator/SpriteGenerator';
import { SpriteAnimator } from './pages/SpriteAnimator/SpriteAnimator';

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<MainLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/quest-builder/:questlineId" element={<QuestBuilder />} />
              <Route path="/create" element={<QuestCreate />} />
              <Route path="/sprite-generator" element={<SpriteGenerator />} />
              <Route path="/sprite-animator" element={<SpriteAnimator />} />
            </Route>
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}
