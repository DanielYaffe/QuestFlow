import React from 'react';

export function PropertiesPanel() {
  return (
    <div className="w-80 bg-zinc-900 border-l border-zinc-800 overflow-auto">
      <div className="p-4">
        <h3 className="text-white mb-4">Properties</h3>

        <div className="space-y-6">
          <div>
            <label className="text-zinc-400 text-sm mb-2 block">Animation Name</label>
            <input
              type="text"
              placeholder="Walk Cycle"
              className="w-full bg-zinc-800 text-white px-3 py-2 rounded-lg border border-zinc-700 focus:border-green-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-zinc-400 text-sm mb-2 block">Loop</label>
            <div className="flex items-center gap-2">
              <input type="checkbox" className="rounded" defaultChecked />
              <span className="text-zinc-300 text-sm">Enable looping</span>
            </div>
          </div>

          <div>
            <label className="text-zinc-400 text-sm mb-2 block">Duration</label>
            <input
              type="text"
              placeholder="1.0s"
              className="w-full bg-zinc-800 text-white px-3 py-2 rounded-lg border border-zinc-700 focus:border-green-500 focus:outline-none"
            />
          </div>

          <div className="pt-4 border-t border-zinc-800">
            <h4 className="text-white text-sm mb-3">Current Frame</h4>
            <div className="space-y-4">
              <div>
                <label className="text-zinc-400 text-xs mb-2 block">Hold Duration</label>
                <input
                  type="text"
                  placeholder="100ms"
                  className="w-full bg-zinc-800 text-white px-3 py-2 text-sm rounded-lg border border-zinc-700 focus:border-green-500 focus:outline-none"
                />
              </div>
              <button className="w-full px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors">
                Duplicate Frame
              </button>
              <button className="w-full px-3 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm rounded-lg transition-colors">
                Delete Frame
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
