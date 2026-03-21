import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ServerSettingsModal({ session, activeServer, handleUpdate, handleDelete, onClose, name, setName }) {
  const [loading, setLoading] = useState(false)
  const [inviteCode, setInviteCode] = useState(activeServer?.invite_code || null)
  const [copied, setCopied] = useState(false)

  const generateInvite = async () => {
    if (!activeServer?.id) {
      toast.error('No active server selected.')
      return
    }
    setLoading(true)
    const newCode = `MS-${Math.random().toString(36).replace(/[^A-Z0-9]/gi, '').substring(0, 6).toUpperCase()}`

    const { data, error } = await supabase
      .from('invites')
      .insert([{ 
        server_id: activeServer.id, 
        creator_id: session.user.id,
        code: newCode 
      }])
      .select()

    if (error || !data || data.length === 0) {
      setInviteCode(null)
      setLoading(false)
      toast.error(`Failed to generate invite. Error: ${error?.message || 'Unknown'}`)
      return
    }
    
    setInviteCode(data[0].code)
    setLoading(false)
  }

  const copyToClipboard = () => {
    if (!inviteCode) return
    navigator.clipboard.writeText(inviteCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-hidden">
      {/* Background Nebula Glows */}
      <div className="absolute -top-[20%] -right-[10%] w-[600px] h-[600px] bg-primary/10 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="absolute -bottom-[10%] -left-[5%] w-[400px] h-[400px] bg-tertiary/5 blur-[100px] rounded-full pointer-events-none"></div>

      {/* Server Settings Modal */}
      <div className="w-full max-w-4xl h-[700px] bg-white/[0.05] backdrop-blur-[12px] rounded-2xl shadow-2xl flex border border-white/10 relative z-10 overflow-hidden outline outline-1 outline-[rgba(70,72,77,0.15)]">
        
        {/* Modal Sidebar (Settings Navigation) */}
        <aside className="w-64 bg-black/20 backdrop-blur-md border-r border-white/5 flex flex-col p-6 overflow-y-auto custom-scrollbar">
          <h2 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mb-4 px-2">Server Settings</h2>
          <div className="space-y-1">
            <button type="button" className="w-full text-left px-3 py-2 rounded-lg bg-white/10 text-primary font-semibold text-sm transition-all flex items-center gap-3 cursor-pointer">
              <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>tune</span>
              Overview
            </button>
            <button type="button" className="w-full text-left px-3 py-2 rounded-lg text-on-surface-variant hover:bg-white/5 hover:text-on-surface text-sm transition-all flex items-center gap-3 cursor-pointer" title="Coming Soon">
              <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>shield_person</span>
              Roles
            </button>
            <button type="button" className="w-full text-left px-3 py-2 rounded-lg text-on-surface-variant hover:bg-white/5 hover:text-on-surface text-sm transition-all flex items-center gap-3 cursor-pointer" title="Coming Soon">
              <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>emoji_emotions</span>
              Emoji & Stickers
            </button>
            <button type="button" className="w-full text-left px-3 py-2 rounded-lg text-on-surface-variant hover:bg-white/5 hover:text-on-surface text-sm transition-all flex items-center gap-3 cursor-pointer" title="Coming Soon">
              <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>monitoring</span>
              Analytics
            </button>
          </div>

          <h2 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mt-8 mb-4 px-2">Community</h2>
          <div className="space-y-1">
            <button type="button" className="w-full text-left px-3 py-2 rounded-lg text-on-surface-variant hover:bg-white/5 hover:text-on-surface text-sm transition-all flex items-center gap-3 cursor-pointer" title="Coming Soon">
              <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>hub</span>
              Discovery
            </button>
            <button type="button" className="w-full text-left px-3 py-2 rounded-lg text-on-surface-variant hover:bg-white/5 hover:text-on-surface text-sm transition-all flex items-center gap-3 cursor-pointer" title="Coming Soon">
              <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>rule</span>
              Rules
            </button>
          </div>

          <button onClick={handleDelete} type="button" className="mt-auto px-3 py-2 rounded-lg text-error hover:bg-error/10 text-sm transition-all flex items-center gap-3 cursor-pointer">
            <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>delete_forever</span>
            Delete Server
          </button>
        </aside>

        {/* Modal Main Content Area */}
        <div className="flex-1 bg-transparent flex flex-col overflow-hidden">
          
          {/* Sticky Header Area */}
          <header className="p-8 pb-4 flex justify-between items-start">
            <div>
              <h3 className="font-headline text-2xl font-bold tracking-tight mb-1">Server Overview</h3>
              <p className="text-on-surface-variant text-sm">Configure your server's appearance and primary settings.</p>
            </div>
            <button onClick={onClose} className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer">
              <span className="material-symbols-outlined text-on-surface-variant" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>close</span>
            </button>
          </header>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-8 pt-4 custom-scrollbar space-y-10">
            
            <form id="server-settings-form" onSubmit={handleUpdate} className="space-y-10">
              {/* Server Identity Section */}
              <section className="space-y-6">
                <div className="flex items-center gap-8">
                  <div className="relative group">
                    <div
                      className="w-24 h-24 rounded-2xl bg-surface-container-highest border border-white/10 flex items-center justify-center overflow-hidden relative cursor-pointer"
                    >
                      <span className="text-3xl font-bold text-white uppercase">{name?.[0]}</span>
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="material-symbols-outlined text-white" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>photo_camera</span>
                      </div>
                    </div>
                    <div className="absolute -top-2 -right-2 bg-primary rounded-full p-1 border-4 border-surface shadow-xl pointer-events-none">
                      <span className="material-symbols-outlined text-[14px] text-on-primary font-bold" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>edit</span>
                    </div>
                  </div>

                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2 block">Server Name</label>
                    <input
                      className="w-full bg-surface-container-lowest border border-white/5 rounded-lg px-4 py-3 text-on-surface focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all placeholder:text-on-surface-variant/40 font-medium"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                </div>
              </section>
            </form>

            {/* Invite Section (CTA) */}
            <section className="p-6 rounded-xl bg-gradient-to-br from-primary/10 to-transparent border border-primary/20 relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 w-32 h-32 bg-primary/10 blur-[40px] rounded-full group-hover:bg-primary/20 transition-all"></div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4">
                  <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>person_add</span>
                  <h4 className="font-headline font-bold text-lg">Invite Friends</h4>
                </div>
                <p className="text-on-surface-variant text-sm mb-6 max-w-md">Grow your community. Share this unique link with others to grant them access to this server.</p>
                <div className="flex gap-2">
                  <div className="flex-1 bg-surface-container-lowest border border-white/10 rounded-lg flex items-center px-4 py-2.5 overflow-hidden">
                    <code className="text-primary-dim font-mono text-sm tracking-wide truncate">{inviteCode || 'No invite code generated'}</code>
                  </div>
                  {inviteCode ? (
                  <button
                    onClick={copyToClipboard}
                    className="bg-primary hover:bg-primary-container text-on-primary-container font-bold px-6 py-2.5 rounded-lg transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>{copied ? 'check' : 'content_copy'}</span>
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  ) : (
                  <button
                    onClick={generateInvite}
                    disabled={loading}
                    className="bg-primary hover:bg-primary-container text-on-primary-container font-bold px-6 py-2.5 rounded-lg transition-all active:scale-95 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>add</span>
                    {loading ? <Loader2 size={18} className="animate-spin" /> : 'Generate'}
                  </button>
                  )}
                </div>
              </div>
            </section>

            {/* Bento Settings Grid - Visual only */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-all group cursor-not-allowed opacity-50">
                <span className="material-symbols-outlined text-primary mb-3" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>alternate_email</span>
                <h5 className="font-bold mb-1">Mentions</h5>
                <p className="text-xs text-on-surface-variant leading-relaxed">Control who can use @everyone and @here tags.</p>
              </div>
              <div className="p-4 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-all group cursor-not-allowed opacity-50">
                <span className="material-symbols-outlined text-primary mb-3" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>history</span>
                <h5 className="font-bold mb-1">Logs</h5>
                <p className="text-xs text-on-surface-variant leading-relaxed">Detailed audit log of all administrative actions.</p>
              </div>
            </div>

            {/* Danger Zone Section */}
            <section className="mt-12">
              <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-white/10 to-transparent mb-10"></div>
              <div className="flex items-center justify-between p-6 rounded-xl border border-error/20 bg-error/5 group">
                <div className="space-y-1">
                  <h4 className="font-headline font-bold text-error flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>warning</span>
                    Danger Zone
                  </h4>
                  <p className="text-on-surface-variant text-sm max-w-sm">Deleting this server is permanent. All messages, channels, and roles will be lost forever.</p>
                </div>
                <button onClick={handleDelete} className="px-6 py-3 rounded-lg border-2 border-error/50 text-error font-bold hover:bg-error hover:text-on-error transition-all active:scale-95 text-sm uppercase tracking-wider cursor-pointer">
                  Delete Server
                </button>
              </div>
            </section>
          </div>

          {/* Sticky Footer Action */}
          <footer className="p-6 bg-black/20 backdrop-blur-xl border-t border-white/5 flex justify-end gap-4">
            <button onClick={onClose} type="button" className="px-6 py-2 rounded-lg text-on-surface-variant hover:text-on-surface font-medium transition-colors text-sm cursor-pointer">
              Cancel
            </button>
            <button form="server-settings-form" type="submit" className="px-8 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white font-bold transition-all text-sm shadow-xl border border-white/10 cursor-pointer">
              Save Changes
            </button>
          </footer>
        </div>
      </div>
    </div>
  )
}
