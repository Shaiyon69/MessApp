export default function ServerCreationModal({ handleCreate, onClose, name, setName }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      {/* Server Creation Modal */}
      <div className="bg-white/[0.03] backdrop-blur-[16px] outline outline-1 outline-[rgba(70,72,77,0.15)] w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl flex flex-col relative">
        {/* Modal Header */}
        <div className="px-8 pt-10 pb-6 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-primary/20 mb-6 outline outline-1 outline-[rgba(70,72,77,0.15)]">
            <span className="material-symbols-outlined text-primary text-3xl" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>add_circle</span>
          </div>
          <h1 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface mb-2">Create Your Galaxy</h1>
          <p className="text-on-surface-variant text-sm max-w-xs mx-auto leading-relaxed">
            Servers are where you and your friends hang out. Set a name and launch your new workspace.
          </p>
        </div>

        {/* Modal Content */}
        <div className="px-8 py-6 space-y-8">
          <form onSubmit={handleCreate}>
            {/* Server Identity Section */}
            <div className="space-y-4 mb-8">
              <div className="flex flex-col gap-2">
                <label className="font-label text-[10px] font-bold uppercase tracking-widest text-primary px-1">Server Name</label>
                <div className="relative group">
                  <input
                    className="w-full bg-surface-container-lowest text-on-surface border-none rounded-xl px-4 py-4 focus:ring-2 focus:ring-primary/50 transition-all font-body text-base placeholder:text-outline-variant/50 shadow-inner"
                    placeholder="The MessApp Hub"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                  />
                  <div className="absolute inset-0 rounded-xl pointer-events-none border border-white/5 group-hover:border-white/10 transition-colors"></div>
                </div>
              </div>
              <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5 outline outline-1 outline-[rgba(70,72,77,0.15)]">
                <div className="w-12 h-12 rounded-full bg-surface-container-highest flex items-center justify-center border border-dashed border-outline-variant">
                  <span className="material-symbols-outlined text-on-surface-variant" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>add_a_photo</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-label text-sm font-semibold">Upload Icon</span>
                  <span className="text-[11px] text-on-surface-variant">Recommended: 512x512px</span>
                </div>
                <button type="button" className="ml-auto font-label text-xs font-bold text-primary px-3 py-1.5 rounded-lg hover:bg-primary/10 transition-colors cursor-pointer">Browse</button>
              </div>
            </div>

            {/* Features Preview (Small Bento Elements) */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-surface-container-low outline outline-1 outline-[rgba(70,72,77,0.15)] flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-lg" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>shield</span>
                <span className="font-label text-[11px] text-on-surface-variant">Private Access</span>
              </div>
              <div className="p-3 rounded-lg bg-surface-container-low outline outline-1 outline-[rgba(70,72,77,0.15)] flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-lg" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>speed</span>
                <span className="font-label text-[11px] text-on-surface-variant">Low Latency</span>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-8 py-8 mt-4 flex items-center justify-between border-t border-white/5 bg-black/20 -mx-8 -mb-6">
              <button type="button" onClick={onClose} className="font-label text-sm font-semibold text-on-surface-variant hover:text-on-surface transition-colors px-4 py-2 cursor-pointer">Back</button>
              <button type="submit" className="px-10 py-3 rounded-full bg-gradient-to-r from-[#85adff] to-[#6e9fff] text-on-primary font-headline font-bold text-sm tracking-wide shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all cursor-pointer">
                Launch
              </button>
            </div>
          </form>
        </div>

        {/* Decorative Close */}
        <button onClick={onClose} type="button" className="absolute top-6 right-6 w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-on-surface-variant hover:text-on-surface transition-all cursor-pointer">
          <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>close</span>
        </button>
      </div>
    </div>
  )
}
