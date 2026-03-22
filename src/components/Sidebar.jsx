import React from 'react';

export default function Sidebar({
  view,
  servers,
  activeServer,
  handleHomeClick,
  handleServerClick,
  setShowCreateModal,
  setShowJoinModal,
  showRightSidebar,
  setShowRightSidebar,
  setRightTab,
  friendRequests,
  setShowUserSettings
}) {
  return (
    <nav className="hidden md:flex flex-col h-full w-[76px] py-4 items-center shrink-0 z-50 glass-nav">
      <div className="mb-6 group cursor-pointer" onClick={handleHomeClick}>
        <div className={`w-12 h-12 flex items-center justify-center rounded-xl transition-all duration-300 ${view === 'home' ? 'bg-gradient-to-br from-[rgb(var(--accent-color))] to-[#6e9fff] text-[#002a62] shadow-[0_0_15px_rgba(var(--accent-color),0.3)]' : 'bg-white/5 text-[rgb(var(--accent-color))] hover:bg-white/10'}`}>
          <span className="material-symbols-outlined font-bold" style={{ fontVariationSettings: "'FILL' 1" }}>rocket_launch</span>
        </div>
      </div>

      <div className="flex flex-col gap-4 items-center flex-1 overflow-y-auto custom-scrollbar w-full">
        {servers.map(s => (
          <button
            key={s.id}
            onClick={() => handleServerClick(s)}
            className={`relative group flex items-center justify-center w-12 h-12 rounded-xl transition-all duration-300 ${activeServer?.id === s.id && view === 'server' ? 'bg-white/10 text-[rgb(var(--accent-color))] border border-[rgba(var(--accent-color),0.3)] shadow-lg' : 'bg-white/5 text-slate-500 hover:text-[rgb(var(--accent-color))] hover:bg-white/10 border border-transparent'}`}
          >
            {activeServer?.id === s.id && view === 'server' && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[rgb(var(--accent-color))] rounded-r-full"></span>
            )}
            <span className="font-headline font-bold text-lg">{s.name[0].toUpperCase()}</span>
          </button>
        ))}

        <div className="w-8 h-[1px] bg-white/10 my-2"></div>

        <button onClick={() => setShowCreateModal(true)} aria-label="Create Server" className="group w-12 h-12 flex items-center justify-center text-slate-500 hover:text-white transition-colors hover:bg-white/5 rounded-xl duration-300">
          <span className="material-symbols-outlined">add</span>
        </button>
        <button onClick={() => setShowJoinModal(true)} aria-label="Join Server" className="group w-12 h-12 flex items-center justify-center text-slate-500 hover:text-[#85adff] transition-colors hover:bg-white/5 rounded-xl duration-300">
          <span className="material-symbols-outlined">explore</span>
        </button>
      </div>

      <div className="mt-auto flex flex-col gap-4 items-center pt-4 border-t border-[var(--glass-border)] w-full">
        <button onClick={() => { setShowRightSidebar(!showRightSidebar); setRightTab('notifications'); }} aria-label="Notifications" className="group w-12 h-12 flex items-center justify-center text-slate-500 hover:text-[rgb(var(--accent-color))] transition-colors hover:bg-white/5 rounded-xl duration-300 relative">
          <span className="material-symbols-outlined">notifications</span>
          {friendRequests.length > 0 && <span className="absolute top-3 right-3 w-2 h-2 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span>}
        </button>
        <button onClick={() => setShowUserSettings(true)} aria-label="Settings" className="group w-12 h-12 flex items-center justify-center text-[rgb(var(--accent-color))] hover:bg-white/10 transition-colors rounded-xl duration-300 bg-white/5">
          <span className="material-symbols-outlined">settings</span>
        </button>
      </div>
    </nav>
  );
}