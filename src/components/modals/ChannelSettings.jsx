function ChannelSettingsModal({ handleUpdate, handleDelete, onClose, name, setName }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900/90 backdrop-blur-xl border border-white/10 text-white p-8 rounded-3xl w-full max-w-md shadow-2xl">
        <h3 className="text-2xl font-bold mb-6 tracking-tight">Channel Settings</h3>
        <form onSubmit={handleUpdate}>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Rename Channel</label>
          <div className="flex items-center bg-black/30 rounded-xl border border-white/5 mt-2 mb-8 px-4 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
            <span className="text-gray-500 text-xl mr-3 font-light">#</span>
            <input className="bg-transparent border-none outline-none w-full py-3 text-white" type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="flex justify-between items-center mt-4 pt-4 border-t border-white/10">
            <button type="button" onClick={handleDelete} className="text-red-400 hover:text-red-300 hover:bg-red-500/10 px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer">Delete Channel</button>
            <div className="flex gap-4">
              <button type="button" onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer px-4 py-2 font-medium transition-colors">Cancel</button>
              <button type="submit" className="bg-primary text-white px-6 py-2 rounded-xl font-bold hover:bg-opacity-90 transition-all shadow-lg shadow-primary/30 cursor-pointer">Save</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
