export default function ChannelSettingsModal({ handleUpdate, handleDelete, onClose, name, setName }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      {/* Channel Settings Modal */}
      <div className="w-full max-w-lg bg-white/[0.03] backdrop-blur-[12px] outline outline-1 outline-[rgba(70,72,77,0.15)] rounded-2xl shadow-2xl overflow-hidden flex flex-col relative z-10">

        {/* Modal Header */}
        <div className="p-6 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center">
              <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>tag</span>
            </div>
            <div>
              <h2 className="font-headline font-bold text-xl tracking-tight text-on-surface">Channel Settings</h2>
              <p className="text-xs text-on-surface-variant uppercase tracking-widest font-medium">Digital Observatory / General</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-white/5 rounded-full transition-colors cursor-pointer">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>close</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-8 space-y-8">
          <form id="channel-settings-form" onSubmit={(e) => { e.preventDefault(); handleUpdate(e); }}>
            {/* Rename Field */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest px-1">Channel Name</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                  <span className="material-symbols-outlined text-primary/60 group-focus-within:text-primary transition-colors" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>tag</span>
                </div>
                <input
                  className="w-full bg-surface-container-lowest border border-white/5 rounded-xl py-3.5 pl-12 pr-4 text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all font-medium outline-none"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                />
              </div>
              <p className="text-[11px] text-on-surface-variant px-1 italic">Names must be lowercase and contain no spaces.</p>
            </div>
          </form>

          {/* Visibility Toggle (Custom Glass Toggle) - Visual only */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 outline outline-1 outline-[rgba(70,72,77,0.15)] opacity-50" title="Coming Soon">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-lg bg-primary/10">
                <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>lock</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-on-surface">Private Channel</p>
                <p className="text-xs text-on-surface-variant">Only invited members can view this</p>
              </div>
            </div>
            <button type="button" className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out bg-surface-container-highest focus:outline-none">
              <span className="pointer-events-none inline-block h-5 w-5 translate-x-0 transform rounded-full bg-surface-container shadow ring-0 transition duration-200 ease-in-out"></span>
            </button>
          </div>

          {/* Bento Style Settings Grid - Visual only */}
          <div className="grid grid-cols-2 gap-4">
            <button type="button" className="p-4 rounded-xl bg-white/5 outline outline-1 outline-[rgba(70,72,77,0.15)] hover:bg-white/10 transition-colors text-left space-y-2 cursor-pointer">
              <span className="material-symbols-outlined text-secondary" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>notifications_active</span>
              <p className="text-xs font-bold text-on-surface">Notifications</p>
            </button>
            <button type="button" className="p-4 rounded-xl bg-white/5 outline outline-1 outline-[rgba(70,72,77,0.15)] hover:bg-white/10 transition-colors text-left space-y-2 cursor-pointer">
              <span className="material-symbols-outlined text-tertiary" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>group</span>
              <p className="text-xs font-bold text-on-surface">Permissions</p>
            </button>
          </div>

          {/* Danger Zone */}
          <div className="pt-4 border-t border-white/5">
            <div className="flex flex-col gap-4">
              <div className="px-1">
                <h3 className="text-xs font-bold text-error uppercase tracking-widest mb-1">Danger Zone</h3>
                <p className="text-xs text-on-surface-variant">Once deleted, all message history will be purged from the observatory.</p>
              </div>
              <button onClick={handleDelete} className="w-full py-4 px-6 rounded-xl border border-error/20 bg-error/5 text-error font-bold flex items-center justify-center gap-3 hover:bg-error hover:text-on-error transition-all active:scale-95 group cursor-pointer">
                <span className="material-symbols-outlined group-hover:fill-current" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>delete_forever</span>
                <span>Delete Channel</span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-6 bg-white/[0.02] border-t border-white/5 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-6 py-2.5 rounded-full text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-colors cursor-pointer">
            Cancel
          </button>
          <button type="submit" form="channel-settings-form" className="px-8 py-2.5 rounded-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold text-sm shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity active:scale-95 cursor-pointer">
            Save Changes
          </button>
        </div>

      </div>
    </div>
  )
}
