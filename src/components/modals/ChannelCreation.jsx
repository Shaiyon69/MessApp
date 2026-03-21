export default function ChannelCreationModal({ handleCreate, onClose, name, setName, serverName }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-hidden">
      {/* Background Nebula Effect (optional context) */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px] -z-10"></div>
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-tertiary/10 rounded-full blur-[100px] -z-10"></div>

      {/* Channel Creation Modal */}
      <div className="w-full max-w-lg bg-white/[0.03] backdrop-blur-[16px] outline outline-1 outline-[rgba(70,72,77,0.15)] rounded-xl shadow-2xl p-8 relative z-10">
        <div className="mb-8">
          <h1 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface mb-2">Create New Channel</h1>
          <p className="text-on-surface-variant text-sm">Designate a new space for {serverName || "your team"}'s collective focus.</p>
        </div>

        <form onSubmit={handleCreate} className="space-y-8">
          {/* Channel Name Input */}
          <div className="space-y-3">
            <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant px-1" htmlFor="channel-name">
              Channel Name
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#85adff] font-headline font-bold text-xl">
                #
              </div>
              <input
                className="w-full bg-white/5 border-none focus:ring-2 focus:ring-[#85adff]/50 rounded-lg py-4 pl-10 pr-4 text-on-surface placeholder:text-outline-variant font-medium transition-all duration-300 shadow-inner"
                id="channel-name"
                placeholder="marketing-sync"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                autoFocus
              />
            </div>
          </div>

          {/* Privacy Options (Bento Style Selection) - Visual only for now */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-surface-container-high/50 p-4 rounded-lg outline outline-1 outline-[rgba(70,72,77,0.15)] cursor-pointer hover:bg-surface-bright transition-colors group">
              <div className="flex items-center gap-3 mb-2">
                <span className="material-symbols-outlined text-primary text-xl" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>public</span>
                <span className="text-sm font-semibold text-on-surface">Public</span>
              </div>
              <p className="text-xs text-on-surface-variant leading-relaxed">Anyone in MessApp can join and view history.</p>
            </div>
            <div className="bg-[#1d2025] p-4 rounded-lg border border-[#85adff]/30 cursor-pointer transition-colors group opacity-50 relative overflow-hidden" title="Coming Soon">
              <div className="flex items-center gap-3 mb-2">
                <span className="material-symbols-outlined text-primary text-xl" style={{ fontVariationSettings: "'FILL' 1, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>lock</span>
                <span className="text-sm font-semibold text-on-surface">Private</span>
              </div>
              <p className="text-xs text-on-surface-variant leading-relaxed">Only invited members can access this vault.</p>
            </div>
          </div>

          {/* Member Selection (Visual only) */}
          <div className="space-y-3">
            <div className="flex justify-between items-center px-1">
              <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                Add Members
              </label>
              <span className="text-[10px] text-primary font-bold bg-primary/10 px-2 py-1 rounded">OPTIONAL</span>
            </div>
            <div className="flex -space-x-2 overflow-hidden py-1">
              {/* Fake avatars for design feel */}
              <button type="button" className="h-10 w-10 rounded-full bg-surface-container-highest outline outline-1 outline-[rgba(70,72,77,0.15)] flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors ring-2 ring-surface-container-high cursor-pointer">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>add</span>
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-4 flex items-center gap-4">
            <button type="button" onClick={onClose} className="flex-1 py-4 text-sm font-bold text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer">
              Cancel
            </button>
            <button type="submit" className="flex-[2] bg-gradient-to-r from-[#85adff] to-[#6e9fff] text-on-primary font-bold py-4 rounded-full shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all duration-200 uppercase tracking-widest text-sm cursor-pointer">
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
