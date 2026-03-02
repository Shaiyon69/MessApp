function ServerSettingsModal({ handleUpdate, handleDelete, onClose, name, setName }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900/90 backdrop-blur-xl border border-white/10 text-white p-8 rounded-3xl w-full max-w-md shadow-2xl">
        <h3 className="text-3xl font-bold text-center mb-2 tracking-tight">Server Settings</h3>
        <p className="text-gray-400 text-center mb-8">Manage your workspace.</p>
        <form onSubmit={handleUpdate}>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Rename Server</label>
          <input className="w-full px-4 py-3 mt-2 mb-8 bg-black/30 rounded-xl border border-white/5 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-white" type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <div className="flex justify-between items-center mt-4 pt-4 border-t border-white/10">
            <button type="button" onClick={handleDelete} className="text-red-400 hover:text-red-300 hover:bg-red-500/10 px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer">Delete Server</button>
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
