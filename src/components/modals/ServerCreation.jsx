export default function ServerCreationModal({ handleCreate, onClose, name, setName }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-white/[0.03] backdrop-blur-[16px] outline outline-1 outline-[rgba(70,72,77,0.15)] w-full max-w-lg rounded-[2rem] overflow-hidden shadow-2xl flex flex-col relative">

        <div className="px-8 pt-10 pb-6 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#85adff]/20 mb-6 outline outline-1 outline-[rgba(70,72,77,0.15)]">
            <span className="material-symbols-outlined text-[#85adff] text-3xl" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200" }}>add_circle</span>
          </div>
          <h2 className="font-headline text-3xl font-extrabold tracking-tight text-white mb-2">Create Your Galaxy</h2>
          <p className="text-slate-400 text-sm max-w-xs mx-auto leading-relaxed">
            Servers are where you and your friends hang out. Set a name and launch your new workspace.
          </p>
        </div>

        <div className="px-8 py-6 space-y-8">
          <form onSubmit={handleCreate}>
            <div className="space-y-4 mb-8">
              <div className="flex flex-col gap-2">
                <label className="font-label text-[10px] font-bold uppercase tracking-widest text-[#85adff] px-1">Server Name</label>
                <div className="relative group">
                  <input
                    className="w-full bg-[#0c0e12] text-white border-none rounded-xl px-4 py-4 focus:ring-2 focus:ring-[#85adff]/50 transition-all font-body text-base placeholder:text-slate-600 shadow-inner outline-none"
                    placeholder="The MessApp Hub"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                  />
                  <div className="absolute inset-0 rounded-xl pointer-events-none border border-white/5 group-hover:border-white/10 transition-colors"></div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-[#111318] outline outline-1 outline-[rgba(70,72,77,0.15)] flex items-center gap-3">
                <span className="material-symbols-outlined text-[#85adff] text-lg" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200" }}>shield</span>
                <span className="font-label text-[11px] text-slate-400">Private Access</span>
              </div>
              <div className="p-3 rounded-lg bg-[#111318] outline outline-1 outline-[rgba(70,72,77,0.15)] flex items-center gap-3">
                <span className="material-symbols-outlined text-[#85adff] text-lg" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200" }}>speed</span>
                <span className="font-label text-[11px] text-slate-400">Low Latency</span>
              </div>
            </div>

            <div className="px-8 py-8 mt-4 flex items-center justify-between border-t border-white/5 bg-black/20 -mx-8 -mb-6">
              <button type="button" onClick={onClose} className="font-label text-sm font-semibold text-slate-400 hover:text-white transition-colors px-4 py-2 cursor-pointer rounded-lg hover:bg-white/5">Back</button>
              <button type="submit" className="px-10 py-3 rounded-full bg-gradient-to-r from-[#85adff] to-[#6e9fff] text-[#002a62] font-headline font-bold text-sm tracking-wide shadow-lg shadow-[#85adff]/20 hover:scale-105 active:scale-95 transition-all cursor-pointer">
                Launch
              </button>
            </div>
          </form>
        </div>

        <button onClick={onClose} type="button" className="absolute top-6 right-6 w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-all cursor-pointer">
          <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200" }}>close</span>
        </button>
      </div>
    </div>
  )
}
