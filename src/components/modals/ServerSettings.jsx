import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { X, Copy, Check, Loader2, Link as LinkIcon, Trash2, Save } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ServerSettingsModal({ session, activeServer, handleUpdate, handleDelete, onClose, name, setName }) {
  const [loading, setLoading] = useState(false)
  const [inviteCode, setInviteCode] = useState(null)
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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 overflow-hidden">
      <div className="glass-panel ghost-border text-on-surface p-8 rounded-3xl w-full max-w-md shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative max-h-[90vh] overflow-y-auto custom-scrollbar">
        <button onClick={onClose} aria-label="Close" title="Close" className="absolute top-6 right-6 text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer hover:bg-surface-container-high p-2 rounded-full">
          <span className="material-symbols-outlined text-xl" aria-hidden="true">close</span>
        </button>

        <h3 className="text-3xl font-bold mb-6 tracking-tight text-on-surface">Server Settings</h3>
        
        <div className="mb-8 p-5 bg-surface-container-low border border-outline-variant/10 rounded-2xl shadow-sm">
          <h4 className="text-xs font-bold text-outline uppercase tracking-widest mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-primary" aria-hidden="true">link</span> Invite Friends
          </h4>
          
          {inviteCode ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-surface-container border border-outline-variant/10 px-4 py-3 rounded-xl text-primary font-mono font-bold tracking-wider overflow-hidden truncate">
                {inviteCode}
              </div>
              <button 
                onClick={copyToClipboard} 
                aria-label="Copy Invite Code"
                title="Copy Invite Code"
                className="bg-primary/10 hover:bg-primary/20 text-primary p-3 rounded-xl transition-all cursor-pointer border border-primary/10"
              >
                {copied ? <span className="material-symbols-outlined text-[20px]" aria-hidden="true">check</span> : <span className="material-symbols-outlined text-[20px]" aria-hidden="true">content_copy</span>}
              </button>
            </div>
          ) : (
            <button 
              onClick={generateInvite} 
              disabled={loading} 
              className="w-full bg-primary-container text-on-primary-container hover:bg-primary-container/80 py-3 rounded-xl font-bold transition-all cursor-pointer flex items-center justify-center gap-2 border border-outline-variant/10"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : 'Generate Invite Code'}
            </button>
          )}
          <p className="text-[10px] text-on-surface-variant mt-3 italic text-center">Give this code to friends so they can join via the Compass icon.</p>
        </div>

        <form onSubmit={handleUpdate} className="space-y-6">
          <div>
            <label className="text-xs font-bold text-outline uppercase tracking-widest ml-1 block mb-2">Server Name</label>
            <input 
              className="w-full px-4 py-3 bg-surface-container-lowest rounded-xl border border-outline-variant/10 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-on-surface font-medium"
              type="text" 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
            />
          </div>
          
          <div className="flex flex-col gap-3 pt-4 border-t border-outline-variant/10">
            <button 
              type="submit" 
              className="w-full bg-primary text-on-primary py-3 rounded-xl font-bold hover:bg-primary-dim transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">save</span>
              Save Changes
            </button>
            
            <div className="flex gap-3">
              <button 
                type="button" 
                onClick={onClose} 
                className="flex-1 bg-surface-container-high hover:bg-surface-variant text-on-surface py-3 rounded-xl font-bold transition-all cursor-pointer border border-outline-variant/10"
              >
                Cancel
              </button>
              <button 
                type="button" 
                onClick={handleDelete} 
                className="flex-1 bg-error/10 hover:bg-error/20 text-error py-3 rounded-xl font-bold transition-all cursor-pointer flex items-center justify-center gap-2 border border-error/20"
              >
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">delete</span>
                Delete
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
