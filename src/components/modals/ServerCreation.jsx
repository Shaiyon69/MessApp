export default function ServerCreationModal({ handleCreate, onClose, name, setName }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white/[0.03] backdrop-blur-[12px] border border-white/5 shadow-2xl text-on-surface p-8 rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto custom-scrollbar">
        <h3 className="text-3xl font-bold text-center mb-2 tracking-tight">Create Server</h3>
        <h4 className="text-1xl font-bold text-center mb-2 tracking-tight text-red-500"> (Work In Progress) </h4>
        <p className="text-on-surface-variant text-center mb-8">Build your community's new home.</p>
        <form onSubmit={handleCreate}>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Server Name</label>
          <input className="w-full px-4 py-3 mt-2 mb-8 bg-surface-container-lowest border border-transparent focus:border-primary focus:ring-2 focus:ring-primary focus-visible:outline-none outline-none transition-all text-on-surface placeholder-gray-600 shadow-inner rounded-xl" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Awesome Workspace" autoFocus />
          <div className="flex justify-end items-center gap-4">
            <button type="button" onClick={onClose} className="bg-white/5 text-on-surface-variant hover:text-white hover:bg-white/10 font-bold py-3.5 px-6 rounded-xl transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none">Cancel</button>
            <button type="submit" className="bg-gradient-to-r from-primary to-primary-container text-on-primary-fixed font-bold py-3.5 px-6 rounded-xl hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none">Launch</button>
          </div>
        </form>
      </div>
    </div>
  )
}
