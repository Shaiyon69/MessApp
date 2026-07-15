/**
 * Presents server rename/delete settings. Visibility is not authorization;
 * backend policies must continue enforcing owner/admin permissions.
 */
import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { X, Copy, Check, Loader2, Trash2, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { trackSpotlight } from '../../lib/uiEffects'

export default function ServerSettingsModal({ activeServer, handleUpdate, handleDelete, onClose, name, setName }) {
  const [loading, setLoading] = useState(false)
  const [inviteCode, setInviteCode] = useState(null)
  const [inviteId, setInviteId] = useState(null)
  const [copied, setCopied] = useState(false)

  const generateInvite = async () => {
    if (!activeServer?.id) return toast.error('No active server selected.')
    setLoading(true)

    const { data, error } = await supabase.rpc('create_server_invite', {
      target_server_id: activeServer.id,
      requested_uses: 100,
      requested_expires_at: null
    })

    if (error || !data?.code) {
      setInviteCode(null)
      setInviteId(null)
      setLoading(false)
      return toast.error(`Failed to generate invite. Error: ${error?.message || 'Unknown'}`)
    }
    
    setInviteCode(data.code)
    setInviteId(data.id)
    setLoading(false)
  }

  const revokeInvite = async () => {
    if (!inviteId) return
    setLoading(true)
    const { error } = await supabase.rpc('revoke_server_invite', { target_invite_id: inviteId })
    setLoading(false)
    if (error) return toast.error('Failed to revoke invite.')
    setInviteCode(null)
    setInviteId(null)
    setCopied(false)
    toast.success('Invite revoked.')
  }

  const copyToClipboard = () => {
    if (!inviteCode) return
    navigator.clipboard.writeText(inviteCode)
    setCopied(true)
    toast.success('Invite code copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div data-ui-overlay-owner="ServerSettings:modal" className="premium-backdrop fixed inset-0 flex flex-col justify-end md:justify-center items-center z-[100] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      <div onMouseMove={trackSpotlight} className="premium-modal premium-card text-white p-6 md:p-8 rounded-t-3xl md:rounded-3xl w-full max-w-md animate-slide-up md:animate-fade-in pb-10 md:pb-8 flex flex-col max-h-[90vh]">
        
        <div className="flex justify-between items-center mb-6 md:mb-8">
          <h3 className="gradient-text text-2xl md:text-3xl font-semibold tracking-tight">Server Overview</h3>
          <button onClick={onClose} className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white transition-colors cursor-pointer md:hidden outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto custom-scrollbar pr-2">
          <div className="premium-section p-5 rounded-2xl mb-6">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 block mb-2">Invite Friends</label>
            <div className="premium-input flex items-center rounded-xl overflow-hidden ghost-border h-14">
              <input className="flex-1 px-4 bg-transparent text-white font-mono outline-none w-full" value={inviteCode || 'Generate a link to share'} readOnly />
              {inviteCode ? (
                <>
                  <button type="button" onClick={copyToClipboard} className="p-4 bg-[var(--accent-glow)] hover:bg-[var(--border-accent)] transition-colors flex items-center justify-center h-full border-l border-[var(--border-subtle)] cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
                    {copied ? <Check size={20} className="text-green-400" /> : <Copy size={20} className="text-indigo-400" />}
                  </button>
                  <button type="button" onClick={revokeInvite} disabled={loading} className="p-4 bg-red-500/10 hover:bg-red-500/20 transition-colors flex items-center justify-center h-full border-l border-[var(--border-subtle)] cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-50" title="Revoke invite" aria-label="Revoke invite">
                    {loading ? <Loader2 className="animate-spin text-red-300" size={18} /> : <Trash2 size={18} className="text-red-300" />}
                  </button>
                </>
              ) : (
                <button type="button" onClick={generateInvite} disabled={loading} className="premium-button px-6 flex items-center justify-center h-full cursor-pointer disabled:opacity-50 rounded-none">
                  {loading ? <Loader2 className="animate-spin text-white" size={20} /> : <span className="text-white font-bold text-sm">Generate</span>}
                </button>
              )}
            </div>
          </div>

          <div className="premium-section p-5 rounded-2xl">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 block mb-2">Server Name</label>
            <div className="premium-input rounded-xl ghost-border h-14 transition-all px-4 flex items-center mb-6">
              <input className="bg-transparent border-none outline-none w-full text-white font-medium" type="text" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            
            <div className="flex flex-col gap-3 pt-4 border-t border-[var(--border-subtle)]">
              <button type="button" onClick={handleUpdate} className="premium-button w-full py-4 md:py-3 rounded-xl font-bold cursor-pointer flex items-center justify-center gap-2">
                <Save size={18} /> Save Changes
              </button>
              
              <div className="flex flex-col md:flex-row gap-3">
                <button type="button" onClick={onClose} className="premium-secondary-button flex-1 py-4 md:py-3 rounded-xl font-bold cursor-pointer hidden md:block">Cancel</button>
                <button type="button" onClick={handleDelete} className="premium-danger-button flex-1 py-4 md:py-3 rounded-xl font-bold cursor-pointer flex items-center justify-center gap-2">
                  <Trash2 size={18} /> Delete Server
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
