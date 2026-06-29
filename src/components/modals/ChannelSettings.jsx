import { trackSpotlight } from '../../lib/uiEffects'

export default function ChannelSettingsModal({ handleUpdate, handleDelete, onClose, name, setName }) {
  return (
    <div className="premium-backdrop fixed inset-0 flex flex-col justify-end md:justify-center items-center z-[100] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      <div onMouseMove={trackSpotlight} className="premium-modal premium-card text-white p-6 md:p-8 rounded-t-3xl md:rounded-3xl w-full max-w-md animate-slide-up md:animate-fade-in pb-10 md:pb-8">
        <h3 className="gradient-text text-2xl font-semibold mb-6 tracking-tight">Channel Settings</h3>
        
        <form onSubmit={handleUpdate}>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 block mb-2">Rename Channel</label>
          <div className="premium-input flex items-center rounded-xl ghost-border mb-8 px-4 h-14 transition-all">
            <span className="text-gray-500 text-xl mr-3 font-light">#</span>
            <input className="bg-transparent border-none outline-none w-full h-full text-white font-medium" type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          
          <div className="flex flex-col md:flex-row justify-between md:items-center mt-4 pt-6 border-t border-[var(--border-subtle)] gap-4">
            <button type="button" onClick={handleDelete} className="premium-danger-button px-4 py-4 md:py-3 rounded-xl font-bold cursor-pointer w-full md:w-auto order-last md:order-first">Delete Channel</button>
            <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
              <button type="button" onClick={onClose} className="premium-secondary-button cursor-pointer px-4 py-4 md:py-3 rounded-xl font-bold w-full md:w-auto">Cancel</button>
              <button type="submit" className="premium-button px-6 py-4 md:py-3 rounded-xl font-bold cursor-pointer w-full md:w-auto">Save</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
