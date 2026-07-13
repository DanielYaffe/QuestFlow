import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import {
  Project,
  fetchProjects,
  createProject as apiCreateProject,
  updateProject as apiUpdateProject,
  deleteProject as apiDeleteProject,
  duplicateProject as apiDuplicateProject,
} from '../api/projectApi';
import { useAuth } from './AuthContext';

const ACTIVE_PROJECT_KEY = 'activeProjectId';

interface ProjectContextValue {
  projects: Project[];
  activeProject: Project | null;
  activeProjectId: string | null;
  loading: boolean;
  setActiveProject: (id: string) => void;
  refreshProjects: () => Promise<Project[]>;
  createProject: (name: string, description?: string) => Promise<Project>;
  renameProject: (id: string, name: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  duplicateProject: (id: string, name?: string) => Promise<Project>;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

function persistActiveId(id: string | null) {
  if (id) {
    localStorage.setItem(ACTIVE_PROJECT_KEY, id);
  } else {
    localStorage.removeItem(ACTIVE_PROJECT_KEY);
  }
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(
    () => localStorage.getItem(ACTIVE_PROJECT_KEY),
  );
  const [loading, setLoading] = useState(true);

  const setActiveProject = useCallback((id: string) => {
    persistActiveId(id);
    setActiveProjectId(id);
  }, []);

  // Load the user's projects, bootstrap a default one if none exist, and make
  // sure an active project is always selected.
  const refreshProjects = useCallback(async (): Promise<Project[]> => {
    let list = await fetchProjects();
    if (list.length === 0) {
      const created = await apiCreateProject('My Project');
      list = [created];
    }
    setProjects(list);

    setActiveProjectId((current) => {
      const stillValid = current && list.some((p) => p._id === current);
      const next = stillValid ? current : list[0]._id;
      persistActiveId(next);
      return next;
    });
    return list;
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setProjects([]);
      setActiveProjectId(null);
      persistActiveId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    refreshProjects().finally(() => setLoading(false));
  }, [isAuthenticated, refreshProjects]);

  const createProject = useCallback(async (name: string, description = '') => {
    const project = await apiCreateProject(name, description);
    await refreshProjects();
    setActiveProject(project._id);
    return project;
  }, [refreshProjects, setActiveProject]);

  const renameProject = useCallback(async (id: string, name: string) => {
    await apiUpdateProject(id, { name });
    await refreshProjects();
  }, [refreshProjects]);

  const deleteProject = useCallback(async (id: string) => {
    await apiDeleteProject(id);
    if (activeProjectId === id) {
      persistActiveId(null);
      setActiveProjectId(null);
    }
    await refreshProjects();
  }, [activeProjectId, refreshProjects]);

  const duplicateProject = useCallback(async (id: string, name?: string) => {
    const project = await apiDuplicateProject(id, name);
    await refreshProjects();
    setActiveProject(project._id);
    return project;
  }, [refreshProjects, setActiveProject]);

  const activeProject = projects.find((p) => p._id === activeProjectId) ?? null;

  return (
    <ProjectContext.Provider value={{
      projects,
      activeProject,
      activeProjectId,
      loading,
      setActiveProject,
      refreshProjects,
      createProject,
      renameProject,
      deleteProject,
      duplicateProject,
    }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used inside ProjectProvider');
  return ctx;
}
