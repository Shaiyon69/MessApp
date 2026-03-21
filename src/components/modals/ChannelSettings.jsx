export default function ChannelSettingsModal({ handleUpdate, handleDelete, onClose, name, setName }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white/[0.03] backdrop-blur-[12px] outline outline-1 outline-[rgba(70,72,77,0.15)] rounded-2xl shadow-2xl overflow-hidden flex flex-col relative z-10">

        <div className="p-6 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#23262c] flex items-center justify-center">
              <span className="material-symbols-outlined text-[#85adff]" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200" }}>tag</span>
            </div>
            <div>
              <h2 className="font-headline font-bold text-xl tracking-tight text-white">Channel Settings</h2>
              <p className="text-xs text-slate-500 uppercase tracking-widest font-medium">Digital Observatory</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-full transition-colors cursor-pointer">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200" }}>close</span>
          </button>
        </div>

        <div className="p-8 space-y-8">
          <form id="channel-settings-form" onSubmit={(e) => { e.preventDefault(); handleUpdate(e); }}>
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest px-1">Channel Name</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                  <span className="material-symbols-outlined text-[#85adff]/60 group-focus-within:text-[#85adff] transition-colors" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200" }}>tag</span>
                </div>
                <input
                  className="w-full bg-[#0c0e12] border border-white/5 rounded-xl py-3.5 pl-12 pr-4 text-white focus:ring-2 focus:ring-[#85adff]/40 transition-all font-medium outline-none"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                />
              </div>
            </div>
          </form>

          <div className="pt-4 border-t border-white/5">
            <div className="flex flex-col gap-4">
              <div className="px-1">
                <h3 className="text-xs font-bold text-error uppercase tracking-widest mb-1">Danger Zone</h3>
                <p className="text-xs text-slate-400">Once deleted, all message history will be purged.</p>
              </div>
              <button onClick={handleDelete} className="w-full py-4 px-6 rounded-xl border border-error/20 bg-error/5 text-error font-bold flex items-center justify-center gap-3 hover:bg-error hover:text-white transition-all active:scale-95 group cursor-pointer">
                <span className="material-symbols-outlined group-hover:fill-current" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200" }}>delete_forever</span>
                <span>Delete Channel</span>
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 bg-white/[0.02] border-t border-white/5 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-6 py-2.5 rounded-full text-sm font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer">
            Cancel
          </button>
          <button type="submit" form="channel-settings-form" className="px-8 py-2.5 rounded-full bg-gradient-to-r from-[#85adff] to-[#6e9fff] text-[#002a62] font-bold text-sm shadow-lg shadow-[#85adff]/20 hover:opacity-90 transition-opacity active:scale-95 cursor-pointer">
            Save Changes
          </button>
        </div>

      </div>
    </div>
  )
}
