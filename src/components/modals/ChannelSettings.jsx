export default function ChannelSettingsModal({ handleUpdate, handleDelete, onClose, name, setName }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex flex-col justify-end md:justify-center items-center z-[100] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      <div className="bg-[#15171a] border border-[#23252a] text-white p-6 md:p-8 rounded-t-3xl md:rounded-3xl w-full max-w-md shadow-2xl animate-slide-up md:animate-fade-in pb-10 md:pb-8">
        <h3 className="text-2xl font-bold mb-6 tracking-tight">Channel Settings</h3>
        
        <form onSubmit={handleUpdate}>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 block mb-2">Rename Channel</label>
          <div className="flex items-center bg-[#0d0f12] rounded-xl border border-[#23252a] mb-8 px-4 h-14 focus-within:border-indigo-500 transition-colors shadow-inner">
            <span className="text-gray-500 text-xl mr-3 font-light">#</span>
            <input className="bg-transparent border-none outline-none w-full h-full text-white font-medium" type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          
          <div className="flex flex-col md:flex-row justify-between md:items-center mt-4 pt-6 border-t border-[#23252a] gap-4">
            <button type="button" onClick={handleDelete} className="text-red-400 hover:text-red-300 bg-red-500/10 border border-red-500/20 px-4 py-4 md:py-3 rounded-xl font-bold transition-colors cursor-pointer w-full md:w-auto order-last md:order-first">Delete Channel</button>
            <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
              <button type="button" onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer px-4 py-4 md:py-3 rounded-xl hover:bg-white/5 font-medium transition-colors w-full md:w-auto">Cancel</button>
              <button type="submit" className="bg-indigo-500 text-white px-6 py-4 md:py-3 rounded-xl font-bold hover:bg-indigo-600 transition-colors cursor-pointer shadow-lg w-full md:w-auto">Save</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
