function ChannelCreationModal({ handleCreate, onClose, name, setName, serverName }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900/90 backdrop-blur-xl border border-white/10 text-white p-8 rounded-3xl w-full max-w-md shadow-2xl">
        <h3 className="text-2xl font-bold mb-1 tracking-tight">Create Channel</h3>
        <p className="text-gray-400 text-sm mb-8">in <span className="text-primary font-medium">{serverName}</span></p>
        <form onSubmit={handleCreate}>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Channel Name</label>
          <div className="flex items-center bg-black/30 rounded-xl border border-white/5 mt-2 mb-8 px-4 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
            <span className="text-gray-500 text-xl mr-3 font-light">#</span>
            <input className="bg-transparent border-none outline-none w-full py-3 text-white placeholder-gray-600" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="new-channel" autoFocus />
          </div>
          <div className="flex justify-end gap-4">
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer px-4 py-2 font-medium transition-colors">Cancel</button>
            <button type="submit" className="bg-primary text-white px-6 py-3 rounded-xl font-bold hover:bg-opacity-90 transition-all shadow-lg shadow-primary/30 cursor-pointer">Create</button>
          </div>
        </form>
      </div>
    </div>
  )
}
