export default function ChannelCreationModal({ handleCreate, onClose, name, setName, serverName }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex flex-col justify-end md:justify-center items-center z-[100] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      <div className="bg-[#15171a] border border-[#23252a] text-white p-6 md:p-8 rounded-t-3xl md:rounded-3xl w-full max-w-md shadow-2xl animate-slide-up md:animate-fade-in pb-10 md:pb-8">
        <h3 className="text-2xl font-bold mb-1 tracking-tight">Create Channel</h3>
        <p className="text-gray-400 text-sm mb-8">in <span className="text-indigo-500 font-medium">{serverName}</span></p>
        
        <form onSubmit={handleCreate}>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 block mb-2">Channel Name</label>
          <div className="flex items-center bg-[#0d0f12] rounded-xl border border-[#23252a] mb-8 px-4 h-14 focus-within:border-indigo-500 transition-colors shadow-inner">
            <span className="text-gray-500 text-xl mr-3 font-light">#</span>
            <input className="bg-transparent border-none outline-none w-full h-full text-white placeholder-gray-600 font-medium" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="new-channel" autoFocus />
          </div>
          
          <div className="flex flex-col-reverse md:flex-row justify-end gap-3 md:gap-4">
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer px-4 py-4 md:py-3 rounded-xl hover:bg-white/5 font-medium transition-colors w-full md:w-auto">Cancel</button>
            <button type="submit" className="bg-indigo-500 text-white px-6 py-4 md:py-3 rounded-xl font-bold hover:bg-indigo-600 transition-colors cursor-pointer shadow-lg w-full md:w-auto">Create Channel</button>
          </div>
        </form>
      </div>
    </div>
  )
}
