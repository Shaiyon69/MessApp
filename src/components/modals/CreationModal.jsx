export default function CreationModal({
  title,
  description,
  icon,
  inputLabel,
  placeholder,
  value,
  onChange,
  onSubmit,
  onClose,
  buttonText,
  type
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-hidden">
      {type === 'channel' ? (
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#85adff]/20 rounded-full blur-[120px] -z-10 pointer-events-none"></div>
      ) : null}

      <div className={`w-full max-w-lg bg-white/[0.03] backdrop-blur-[16px] outline outline-1 outline-[rgba(70,72,77,0.15)] shadow-2xl flex flex-col relative z-10 ${type === 'server' ? 'rounded-[2rem] overflow-hidden' : 'rounded-2xl p-8'}`}>

        <div className={type === 'server' ? "px-8 pt-10 pb-6 text-center" : "mb-8"}>
          {type === 'server' && (
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#85adff]/20 mb-6 outline outline-1 outline-[rgba(70,72,77,0.15)]">
              <span className="material-symbols-outlined text-[#85adff] text-3xl" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200" }}>{icon}</span>
            </div>
          )}
          <h2 className="font-headline text-3xl font-extrabold tracking-tight text-white mb-2">{title}</h2>
          <p className={type === 'server' ? "text-slate-400 text-sm max-w-xs mx-auto leading-relaxed" : "text-slate-400 text-sm"}>{description}</p>
        </div>

        <div className={type === 'server' ? 'px-8 py-6 space-y-8' : ''}>
          <form onSubmit={onSubmit} className={type === 'channel' ? 'space-y-8' : ''}>
            <div className={type === 'server' ? 'space-y-4 mb-8' : 'space-y-3'}>
              {type === 'server' ? (
                <div className="flex flex-col gap-2">
                  <label className="font-label text-[10px] font-bold uppercase tracking-widest text-[#85adff] px-1">{inputLabel}</label>
                  <div className="relative group">
                    <input
                      className="w-full bg-[#0c0e12] text-white border-none rounded-xl px-4 py-4 focus:ring-2 focus:ring-[#85adff]/50 transition-all font-body text-base placeholder:text-slate-600 shadow-inner outline-none"
                      placeholder={placeholder}
                      type="text"
                      value={value}
                      onChange={(e) => onChange(e.target.value)}
                      autoFocus
                    />
                    <div className="absolute inset-0 rounded-xl pointer-events-none border border-white/5 group-hover:border-white/10 transition-colors"></div>
                  </div>
                </div>
              ) : (
                <>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 px-1 font-label" htmlFor="channel-name">
                    {inputLabel}
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#85adff] font-headline font-bold text-xl">
                      {icon}
                    </div>
                    <input
                      className="w-full bg-white/5 border-none focus:ring-2 focus:ring-[#85adff]/50 rounded-xl py-4 pl-10 pr-4 text-white placeholder-slate-600 font-medium transition-all duration-300 shadow-inner outline-none"
                      id="channel-name"
                      placeholder={placeholder}
                      type="text"
                      value={value}
                      onChange={(e) => onChange(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                      autoFocus
                    />
                  </div>
                </>
              )}
            </div>

            {type === 'server' ? (
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
            ) : (
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
            )}

            {type === 'server' ? (
              <div className="px-8 py-8 mt-4 flex items-center justify-between border-t border-white/5 bg-black/20 -mx-8 -mb-6">
                <button type="button" onClick={onClose} className="font-label text-sm font-semibold text-slate-400 hover:text-white transition-colors px-4 py-2 cursor-pointer rounded-lg hover:bg-white/5">Back</button>
                <button type="submit" className="px-10 py-3 rounded-full bg-gradient-to-r from-[#85adff] to-[#6e9fff] text-[#002a62] font-headline font-bold text-sm tracking-wide shadow-lg shadow-[#85adff]/20 hover:scale-105 active:scale-95 transition-all cursor-pointer">
                  {buttonText}
                </button>
              </div>
            ) : (
              <div className="pt-4 flex items-center gap-4">
                <button type="button" onClick={onClose} className="flex-1 py-4 text-sm font-bold text-slate-400 hover:text-white transition-colors cursor-pointer rounded-xl hover:bg-white/5">
                  Cancel
                </button>
                <button type="submit" className="flex-[2] bg-gradient-to-r from-[#85adff] to-[#6e9fff] text-[#002a62] font-bold py-4 rounded-full shadow-lg shadow-[#85adff]/20 hover:scale-[1.02] active:scale-95 transition-all duration-200 uppercase tracking-widest text-sm cursor-pointer">
                  {buttonText}
                </button>
              </div>
            )}
          </form>
        </div>

        {type === 'server' && (
          <button onClick={onClose} type="button" className="absolute top-6 right-6 w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-all cursor-pointer">
            <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200" }}>close</span>
          </button>
        )}
      </div>
    </div>
  )
}