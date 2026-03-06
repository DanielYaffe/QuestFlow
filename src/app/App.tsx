import React from 'react';
import { Toaster } from 'sonner';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { SpriteJobProvider } from './context/SpriteJobContext';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { MainLayout } from './layouts/MainLayout';
import { Login } from './pages/Login/Login';
import { AuthCallback } from './pages/AuthCallback/AuthCallback';
import { Dashboard } from './pages/Dashboard/Dashboard';
import { QuestBuilder } from './pages/QuestBuilder/QuestBuilder';
import { QuestBuilderLanding } from './pages/QuestBuilder/QuestBuilderLanding';
import { QuestCreate } from './pages/QuestCreate/QuestCreate';
import { SpriteGenerator } from './pages/SpriteGenerator/SpriteGenerator';
import { SpriteAnimator } from './pages/SpriteAnimator/SpriteAnimator';

export default function App() {
  return (
    <AuthProvider>
      <SpriteJobProvider>
      <Toaster position="bottom-right" theme="dark" richColors />
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<MainLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/quest-builder" element={<QuestBuilderLanding />} />
              <Route path="/quest-builder/:questlineId" element={<QuestBuilder />} />
              <Route path="/create" element={<QuestCreate />} />
              <Route path="/sprite-generator" element={<SpriteGenerator />} />
              <Route path="/sprite-animator" element={<SpriteAnimator />} />
            </Route>
          </Route>
        </Routes>
      </HashRouter>
      </SpriteJobProvider>
    </AuthProvider>
  );
}
