import React from 'react';
import { Outlet } from 'react-router-dom';
import { TopNav } from '../components/layout/TopNav';

export function MainLayout() {
  return (
    <div className="w-screen h-screen bg-zinc-950 flex flex-col overflow-hidden">
      <div onPointerDownCapture={(e) => e.stopPropagation()}>
        <TopNav />
      </div>
      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
