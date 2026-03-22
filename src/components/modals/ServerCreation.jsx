export default function ServerCreationModal({ handleCreate, onClose, name, setName }) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 overflow-hidden">
      <div className="glass-panel ghost-border text-on-surface p-8 rounded-3xl w-full max-w-md shadow-[0_20px_50px_rgba(0,0,0,0.5)] max-h-[90vh] overflow-y-auto custom-scrollbar">
        <h3 className="text-3xl font-bold text-center mb-2 tracking-tight">Create Server</h3>
        <h4 className="text-sm font-bold text-center mb-2 tracking-tight text-error"> (Work In Progress) </h4>
        <p className="text-outline text-center mb-8">Build your community's new home.</p>
        <form onSubmit={handleCreate}>
          <label className="text-xs font-bold text-outline uppercase tracking-widest ml-1 block mb-2">Server Name</label>
          <div className="flex items-center bg-surface-container-lowest rounded-xl border border-outline-variant/10 mb-8 px-4 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all shadow-sm">
            <span className="material-symbols-outlined text-outline text-[18px] mr-2" aria-hidden="true">dns</span>
            <input
              className="bg-transparent border-none outline-none w-full py-3 text-on-surface placeholder:text-outline/60 font-medium"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Awesome Workspace"
              autoFocus
            />
          </div>
          <div className="flex justify-end items-center gap-3 pt-4 border-t border-outline-variant/10">
            <button type="button" onClick={onClose} className="bg-surface-container-high hover:bg-surface-variant text-on-surface py-3 px-6 rounded-xl font-bold transition-colors cursor-pointer border border-outline-variant/10">Cancel</button>
            <button type="submit" className="bg-primary text-on-primary px-8 py-3 rounded-xl font-bold hover:bg-primary-dim transition-colors shadow-md cursor-pointer flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">rocket_launch</span> Launch
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
