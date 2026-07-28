import React from 'react';
import { Toaster } from 'sonner';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SpriteJobProvider } from './context/SpriteJobContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Landing } from './pages/Landing/Landing';
import { ProjectProvider } from './context/ProjectContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { MainLayout } from './layouts/MainLayout';
import { Login } from './pages/Login/Login';
import { AuthCallback } from './pages/AuthCallback/AuthCallback';
import { Dashboard } from './pages/Dashboard/Dashboard';
import { Projects } from './pages/Projects/Projects';
import { ProjectDashboard } from './pages/Projects/ProjectDashboard';
import { Games } from './pages/Games/Games';
import { GameDetail } from './pages/Games/GameDetail';
import { KbDocumentEditor } from './pages/Games/KbDocumentEditor';
import { KbPlayground } from './pages/Games/KbPlayground';
import { Characters } from './pages/Project/Characters';
import { Items } from './pages/Project/Items';
import { Studio } from './pages/Studio/Studio';
import { DesignSheet } from './pages/Studio/DesignSheet';
import { SpriteViewer } from './pages/Studio/SpriteViewer';
import { ItemSheet } from './pages/Studio/ItemSheet';
import { QuestBuilder } from './pages/QuestBuilder/QuestBuilder';
import { QuestBuilderLanding } from './pages/QuestBuilder/QuestBuilderLanding';
import { QuestCreate } from './pages/QuestCreate/QuestCreate';
import { SpriteGenerator } from './pages/SpriteGenerator/SpriteGenerator';
import { SpriteAnimator } from './pages/SpriteAnimator/SpriteAnimator';
import { Settings } from './pages/Settings/Settings';
import { AdminRoute } from './components/AdminRoute';
import { AdminPage } from './pages/Admin/AdminPage';

/** Public landing at "/"; signed-in users go straight to the app. */
function RootRoute() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <Landing />;
}

export default function App() {
  return (
    <AuthProvider>
      <ProjectProvider>
        <SpriteJobProvider>
          <Toaster position="bottom-right" theme="dark" richColors />
          <HashRouter>
            <Routes>
              <Route path="/" element={<RootRoute />} />
              <Route path="/login" element={<Login />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<MainLayout />}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/projects" element={<Projects />} />
                  <Route path="/projects/:projectId" element={<ProjectDashboard />} />
                  <Route path="/projects/:projectId/characters" element={<Characters />} />
                  <Route path="/projects/:projectId/items" element={<Items />} />
                  <Route path="/games" element={<Games />} />
                  <Route path="/games/:gameId" element={<GameDetail />} />
                  <Route path="/games/:gameId/docs/new" element={<KbDocumentEditor />} />
                  <Route path="/games/:gameId/docs/:docId" element={<KbDocumentEditor />} />
                  <Route path="/games/:gameId/playground" element={<KbPlayground />} />
                  <Route path="/studio" element={<Studio />} />
                  <Route path="/studio/items/:itemId" element={<ItemSheet />} />
                  <Route path="/studio/items/:itemId/sprites" element={<SpriteViewer />} />
                  <Route path="/studio/:characterId" element={<DesignSheet />} />
                  <Route path="/studio/:characterId/sprites" element={<SpriteViewer />} />
                  <Route path="/quest-builder" element={<QuestBuilderLanding />} />
                  <Route path="/quest-builder/:questlineId" element={<QuestBuilder />} />
                  <Route path="/create" element={<QuestCreate />} />
                  <Route path="/sprite-generator" element={<SpriteGenerator />} />
                  <Route path="/sprite-animator" element={<SpriteAnimator />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route element={<AdminRoute />}>
                    <Route path="/admin" element={<AdminPage />} />
                  </Route>
                </Route>
              </Route>
            </Routes>
          </HashRouter>
        </SpriteJobProvider>
      </ProjectProvider>
    </AuthProvider>
  );
}
