export default function ChannelSettingsModal({ handleUpdate, handleDelete, onClose, name, setName }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white/[0.03] backdrop-blur-[12px] border border-white/5 shadow-2xl text-on-surface p-8 rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto custom-scrollbar">
        <h3 className="text-2xl font-bold mb-6 tracking-tight">Channel Settings</h3>
        <form onSubmit={handleUpdate}>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Rename Channel</label>
          <div className="flex items-center bg-surface-container-lowest border border-transparent shadow-inner rounded-xl mt-2 mb-8 px-4 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary focus-within:outline-none transition-all">
            <span className="text-gray-500 text-xl mr-3 font-light" aria-hidden="true">#</span>
            <input className="bg-transparent border-none outline-none w-full py-3 text-on-surface focus-visible:outline-none" type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="flex justify-between items-center mt-4 pt-4 border-t border-white/10">
            <button type="button" onClick={handleDelete} className="text-red-400 hover:text-red-300 hover:bg-red-500/10 px-4 py-2 rounded-xl font-bold transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:outline-none">Delete Channel</button>
            <div className="flex gap-4">
              <button type="button" onClick={onClose} className="bg-white/5 text-on-surface-variant hover:text-white hover:bg-white/10 font-bold py-3.5 px-6 rounded-xl transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none">Cancel</button>
              <button type="submit" className="bg-gradient-to-r from-primary to-primary-container text-on-primary-fixed font-bold py-3.5 px-6 rounded-xl hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none">Save</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
