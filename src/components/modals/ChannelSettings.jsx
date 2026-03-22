export default function ChannelSettingsModal({ handleUpdate, handleDelete, onClose, name, setName }) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 overflow-hidden">
      <div className="glass-panel ghost-border text-on-surface p-8 rounded-3xl w-full max-w-md shadow-[0_20px_50px_rgba(0,0,0,0.5)] max-h-[90vh] overflow-y-auto custom-scrollbar">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl font-bold tracking-tight">Channel Settings</h3>
          <button onClick={onClose} aria-label="Close" title="Close" className="text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer hover:bg-surface-container-high p-2 rounded-full">
            <span className="material-symbols-outlined text-xl" aria-hidden="true">close</span>
          </button>
        </div>
        <form onSubmit={handleUpdate}>
          <label className="text-xs font-bold text-outline uppercase tracking-widest ml-1 block mb-2">Rename Channel</label>
          <div className="flex items-center bg-surface-container-lowest rounded-xl border border-outline-variant/10 mb-8 px-4 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all shadow-sm">
            <span className="material-symbols-outlined text-outline text-[18px] mr-2" aria-hidden="true">tag</span>
            <input className="bg-transparent border-none outline-none w-full py-3 text-on-surface font-medium" type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="flex justify-between items-center pt-4 border-t border-outline-variant/10">
            <button type="button" onClick={handleDelete} className="text-error hover:bg-error/10 px-4 py-2 rounded-lg font-bold transition-colors cursor-pointer border border-transparent hover:border-error/20 flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">delete</span> Delete
            </button>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="bg-surface-container-high hover:bg-surface-variant text-on-surface py-3 px-6 rounded-xl font-bold transition-colors cursor-pointer border border-outline-variant/10">Cancel</button>
              <button type="submit" className="bg-primary text-on-primary px-8 py-3 rounded-xl font-bold hover:bg-primary-dim transition-colors shadow-md cursor-pointer flex items-center gap-1">
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">save</span> Save
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
