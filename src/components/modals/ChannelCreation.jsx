export default function ChannelCreationModal({ handleCreate, onClose, name, setName, serverName }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#85adff]/20 rounded-full blur-[120px] -z-10 pointer-events-none"></div>

      <div className="w-full max-w-lg bg-white/[0.03] backdrop-blur-[16px] outline outline-1 outline-[rgba(70,72,77,0.15)] rounded-2xl shadow-2xl p-8 relative z-10 flex flex-col">
        <div className="mb-8">
          <h2 className="font-headline text-3xl font-extrabold tracking-tight text-white mb-2">Create New Channel</h2>
          <p className="text-slate-400 text-sm">Designate a new space for {serverName || "your team"}'s collective focus.</p>
        </div>

        <form onSubmit={handleCreate} className="space-y-8">
          <div className="space-y-3">
            <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 px-1 font-label" htmlFor="channel-name">
              Channel Name
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#85adff] font-headline font-bold text-xl">
                #
              </div>
              <input
                className="w-full bg-white/5 border-none focus:ring-2 focus:ring-[#85adff]/50 rounded-xl py-4 pl-10 pr-4 text-white placeholder-slate-600 font-medium transition-all duration-300 shadow-inner outline-none"
                id="channel-name"
                placeholder="general-chat"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                autoFocus
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#1d2025]/50 p-4 rounded-xl outline outline-1 outline-[rgba(70,72,77,0.15)] cursor-pointer hover:bg-white/5 transition-colors group">
              <div className="flex items-center gap-3 mb-2">
                <span className="material-symbols-outlined text-[#85adff] text-xl" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200" }}>public</span>
                <span className="text-sm font-semibold text-white">Public</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">Anyone in the server can join.</p>
            </div>
            <div className="bg-[#1d2025] p-4 rounded-xl border border-[#85adff]/30 cursor-not-allowed transition-colors group opacity-50" title="Coming Soon">
              <div className="flex items-center gap-3 mb-2">
                <span className="material-symbols-outlined text-[#85adff] text-xl" style={{ fontVariationSettings: "'FILL' 1, 'wght' 200" }}>lock</span>
                <span className="text-sm font-semibold text-white">Private</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">Only invited members can access.</p>
            </div>
          </div>

          <div className="pt-4 flex items-center gap-4">
            <button type="button" onClick={onClose} className="flex-1 py-4 text-sm font-bold text-slate-400 hover:text-white transition-colors cursor-pointer rounded-xl hover:bg-white/5">
              Cancel
            </button>
            <button type="submit" className="flex-[2] bg-gradient-to-r from-[#85adff] to-[#6e9fff] text-[#002a62] font-bold py-4 rounded-full shadow-lg shadow-[#85adff]/20 hover:scale-[1.02] active:scale-95 transition-all duration-200 uppercase tracking-widest text-sm cursor-pointer">
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
