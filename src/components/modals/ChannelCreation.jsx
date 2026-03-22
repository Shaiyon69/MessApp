export default function ChannelCreationModal({ handleCreate, onClose, name, setName, serverName }) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 overflow-hidden">
      <div className="glass-panel ghost-border text-on-surface p-8 rounded-3xl w-full max-w-md shadow-[0_20px_50px_rgba(0,0,0,0.5)] max-h-[90vh] overflow-y-auto custom-scrollbar">
        <h3 className="text-2xl font-bold mb-1 tracking-tight">Create Channel</h3>
        <p className="text-outline text-sm mb-8">in <span className="text-primary font-medium">{serverName}</span></p>
        <form onSubmit={handleCreate}>
          <label className="text-xs font-bold text-outline uppercase tracking-widest ml-1 block mb-2">Channel Name</label>
          <div className="flex items-center bg-surface-container-lowest rounded-xl border border-outline-variant/10 mb-8 px-4 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all shadow-sm">
            <span className="material-symbols-outlined text-outline text-[18px] mr-2" aria-hidden="true">tag</span>
            <input className="bg-transparent border-none outline-none w-full py-3 text-on-surface placeholder:text-outline/60 font-medium" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="new-channel" autoFocus />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant/10">
            <button type="button" onClick={onClose} className="bg-surface-container-high hover:bg-surface-variant text-on-surface py-3 px-6 rounded-xl font-bold transition-colors cursor-pointer border border-outline-variant/10">Cancel</button>
            <button type="submit" className="bg-primary text-on-primary px-8 py-3 rounded-xl font-bold hover:bg-primary-dim transition-colors shadow-md cursor-pointer">Create</button>
          </div>
        </form>
      </div>
    </div>
  )
}
