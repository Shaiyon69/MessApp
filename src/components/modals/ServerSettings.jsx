import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { generateSecureRandomString } from '../../lib/crypto'

export default function ServerSettingsModal({ session, activeServer, handleUpdate, handleDelete, onClose, name, setName }) {
  const [loading, setLoading] = useState(false)
  const [inviteCode, setInviteCode] = useState(activeServer?.invite_code || null)
  const [copied, setCopied] = useState(false)

  const generateInvite = async () => {
    if (!activeServer?.id) return toast.error('No active server selected.')
    setLoading(true)
    const newCode = `MS-${generateSecureRandomString(6).toUpperCase()}`

    const { data, error } = await supabase.from('invites').insert([{ server_id: activeServer.id, creator_id: session.user.id, code: newCode }]).select()
    if (error || !data || data.length === 0) {
      setInviteCode(null)
      setLoading(false)
      toast.error(`Failed to generate invite.`)
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-6 overflow-hidden">
      <div className="absolute -top-[20%] -right-[10%] w-[600px] h-[600px] bg-[#85adff]/10 blur-[120px] rounded-full pointer-events-none"></div>

      <div className="w-full max-w-4xl h-[700px] bg-white/[0.05] backdrop-blur-[12px] rounded-2xl shadow-2xl flex border border-white/10 relative z-10 overflow-hidden outline outline-1 outline-[rgba(70,72,77,0.15)]">
        
        <aside className="w-64 bg-black/20 backdrop-blur-md border-r border-white/5 flex flex-col p-6 overflow-y-auto custom-scrollbar">
          <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-4 px-2">Server Settings</h2>
          <div className="space-y-1">
            <button type="button" className="w-full text-left px-3 py-2 rounded-lg bg-white/10 text-[#85adff] font-semibold text-sm transition-all flex items-center gap-3 cursor-pointer">
              <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1, 'wght' 200" }}>tune</span>
              Overview
            </button>
            <button type="button" className="w-full text-left px-3 py-2 rounded-lg text-slate-400 hover:bg-white/5 hover:text-white text-sm transition-all flex items-center gap-3 cursor-not-allowed opacity-50">
              <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200" }}>shield_person</span>
              Roles
            </button>
          </div>

          <button onClick={handleDelete} type="button" className="mt-auto px-3 py-2 rounded-lg text-error hover:bg-error/10 text-sm transition-all flex items-center gap-3 cursor-pointer">
            <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200" }}>delete_forever</span>
            Delete Server
          </button>
        </aside>

        <div className="flex-1 bg-transparent flex flex-col overflow-hidden">
          <header className="p-8 pb-4 flex justify-between items-start">
            <div>
              <h3 className="font-headline text-2xl font-bold tracking-tight mb-1 text-white">Server Overview</h3>
              <p className="text-slate-400 text-sm">Configure your server's appearance and primary settings.</p>
            </div>
            <button onClick={onClose} className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer">
              <span className="material-symbols-outlined text-slate-400" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200" }}>close</span>
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-8 pt-4 custom-scrollbar space-y-10">
            <form id="server-settings-form" onSubmit={handleUpdate} className="space-y-6">
              <div className="flex items-center gap-8">
                <div className="relative group">
                  <div className="w-24 h-24 rounded-2xl bg-[#23262c] border border-white/10 flex items-center justify-center overflow-hidden relative cursor-pointer">
                    <span className="text-3xl font-bold text-white uppercase">{name?.[0]}</span>
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="material-symbols-outlined text-white" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200" }}>photo_camera</span>
                    </div>
                  </div>
                </div>
                <div className="flex-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block font-label">Server Name</label>
                  <input
                    className="w-full bg-[#0c0e12] border border-white/5 rounded-lg px-4 py-3 text-white focus:ring-1 focus:ring-[#85adff] outline-none transition-all font-medium"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </div>
            </form>

            <section className="p-6 rounded-xl bg-gradient-to-br from-[#85adff]/10 to-transparent border border-[#85adff]/20 relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 w-32 h-32 bg-[#85adff]/10 blur-[40px] rounded-full transition-all"></div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4">
                  <span className="material-symbols-outlined text-[#85adff]" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200" }}>person_add</span>
                  <h4 className="font-headline font-bold text-lg text-white">Invite Friends</h4>
                </div>
                <p className="text-slate-400 text-sm mb-6 max-w-md">Grow your community. Share this unique link with others to grant them access.</p>
                <div className="flex gap-2">
                  <div className="flex-1 bg-[#0c0e12] border border-white/10 rounded-lg flex items-center px-4 py-2.5 overflow-hidden">
                    <code className="text-[#85adff] font-mono text-sm tracking-wide truncate">{inviteCode || 'No invite code generated'}</code>
                  </div>
                  {inviteCode ? (
                  <button onClick={copyToClipboard} className="bg-[#85adff] text-[#002a62] font-bold px-6 py-2.5 rounded-lg transition-all active:scale-95 flex items-center gap-2 cursor-pointer hover:brightness-110">
                    <span className="material-symbols-outlined text-sm">{copied ? 'check' : 'content_copy'}</span>
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  ) : (
                  <button onClick={generateInvite} disabled={loading} className="bg-[#85adff] text-[#002a62] font-bold px-6 py-2.5 rounded-lg transition-all active:scale-95 flex items-center gap-2 cursor-pointer disabled:opacity-50 hover:brightness-110">
                    <span className="material-symbols-outlined text-sm">add</span>
                    {loading ? <Loader2 size={18} className="animate-spin" /> : 'Generate'}
                  </button>
                  )}
                </div>
              </div>
            </section>

            <section className="mt-12">
              <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-white/10 to-transparent mb-10"></div>
              <div className="flex items-center justify-between p-6 rounded-xl border border-error/20 bg-error/5 group">
                <div className="space-y-1">
                  <h4 className="font-headline font-bold text-error flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200" }}>warning</span>
                    Danger Zone
                  </h4>
                  <p className="text-slate-400 text-sm max-w-sm">Deleting this server is permanent. All messages will be lost forever.</p>
                </div>
                <button onClick={handleDelete} className="px-6 py-3 rounded-lg border-2 border-error/50 text-error font-bold hover:bg-error hover:text-white transition-all active:scale-95 text-sm uppercase tracking-wider cursor-pointer">
                  Delete Server
                </button>
              </div>
            </section>
          </div>

          <footer className="p-6 bg-black/20 backdrop-blur-xl border-t border-white/5 flex justify-end gap-4 shrink-0">
            <button onClick={onClose} type="button" className="px-6 py-2 rounded-lg text-slate-400 hover:text-white font-medium transition-colors text-sm cursor-pointer hover:bg-white/5">
              Cancel
            </button>
            <button form="server-settings-form" type="submit" className="px-8 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold transition-all text-sm shadow-xl border border-white/10 cursor-pointer">
              Save Changes
            </button>
          </footer>
        </div>
      </div>
    </div>
  )
}
