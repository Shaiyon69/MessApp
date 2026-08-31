/** Presents rename/delete controls; Dashboard owns authorization and mutations. */
import { trackSpotlight } from '../../lib/uiEffects'

export default function ChannelSettingsModal({ handleUpdate, handleDelete, onClose, name, setName }) {
  return (
    <div data-ui-overlay-owner="ChannelSettings:modal" className="premium-backdrop fixed inset-0 flex flex-col justify-end md:justify-center items-center z-[100] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      <div onMouseMove={trackSpotlight} className="premium-modal text-white p-5 rounded-t-3xl md:rounded-2xl w-full max-w-sm animate-slide-up md:animate-fade-in pb-8 md:pb-5">
        <h3 className="gradient-text type-title font-semibold mb-4 tracking-tight">Channel Settings</h3>
        
        <form onSubmit={handleUpdate}>
          <label className="type-meta font-bold text-gray-500 uppercase tracking-widest block mb-2">Rename Channel</label>
          <div className="premium-input flex items-center rounded-xl ghost-border px-4 h-12 transition-all">
            <span className="text-gray-500 mr-2 font-light">#</span>
            <input className="bg-transparent border-none outline-none w-full h-full text-white font-medium" type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          
          <div className="flex flex-col md:flex-row justify-between md:items-center mt-5 pt-4 border-t border-[var(--border-subtle)] gap-3">
            <button type="button" onClick={handleDelete} className="premium-danger-button px-4 h-11 rounded-xl font-bold cursor-pointer w-full md:w-auto order-last md:order-first">Delete Channel</button>
            <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
              <button type="button" onClick={onClose} className="premium-secondary-button cursor-pointer px-4 h-11 rounded-xl font-bold w-full md:w-auto">Cancel</button>
              <button type="submit" className="premium-button px-5 h-11 rounded-xl font-bold cursor-pointer w-full md:w-auto">Save</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
