export default function ServerCreationModal({ handleCreate, onClose, name, setName }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900/90 backdrop-blur-xl border border-white/10 text-white p-8 rounded-3xl w-full max-w-md shadow-2xl">
        <h3 className="text-3xl font-bold text-center mb-2 tracking-tight">Create Server</h3>
        <h4 className="text-1xl font-bold text-center mb-2 tracking-tight text-red-500"> (Work In Progress) </h4>
        <p className="text-gray-400 text-center mb-8">Build your community's new home.</p>
        <form onSubmit={handleCreate}>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Server Name</label>
          <input className="w-full px-4 py-3 mt-2 mb-8 bg-black/30 rounded-xl border border-white/5 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-white placeholder-gray-600" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Awesome Workspace" autoFocus />
          <div className="flex justify-end items-center gap-4">
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer px-4 py-2 font-medium transition-colors">Cancel</button>
            <button type="submit" className="bg-primary text-white px-8 py-3 rounded-xl font-bold hover:bg-opacity-90 transition-all shadow-lg shadow-primary/30 cursor-pointer">Launch</button>
          </div>
        </form>
      </div>
    </div>
  )
}
