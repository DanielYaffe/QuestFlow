import React from 'react';
import { Outlet } from 'react-router-dom';
import { SideNav } from '../components/layout/SideNav';

export function MainLayout() {
  return (
    <div className="w-screen h-screen bg-steel-950 flex overflow-hidden">
      <div className="h-full" onPointerDownCapture={(e) => e.stopPropagation()}>
        <SideNav />
      </div>
      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
