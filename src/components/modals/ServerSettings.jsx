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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white/[0.03] backdrop-blur-[12px] border border-white/5 shadow-2xl text-on-surface p-8 rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto custom-scrollbar relative">
        <button aria-label="Close Modal" title="Close Modal" onClick={onClose} className="absolute top-6 right-6 text-on-surface-variant hover:text-primary transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none rounded-xl p-1">
          <X size={24} />
        </button>

        <h3 className="text-3xl font-bold mb-6 tracking-tight">Server Settings</h3>
        
        <div className="mb-8 p-5 bg-surface-container-low border border-white/5 rounded-2xl shadow-inner">
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <LinkIcon size={14} className="text-primary" aria-hidden="true" /> Invite Friends
          </h4>
          
          {inviteCode ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-surface-container-lowest border border-transparent shadow-inner px-4 py-3 rounded-xl text-primary font-mono font-bold tracking-wider overflow-hidden truncate">
                {inviteCode}
              </div>
              <button 
                onClick={copyToClipboard} 
                aria-label="Copy Invite Code"
                title="Copy Invite Code"
                className="bg-primary/20 hover:bg-primary/30 text-primary p-3 rounded-xl transition-all cursor-pointer border border-primary/20 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
              >
                {copied ? <Check size={20} /> : <Copy size={20} />}
              </button>
            </div>
          ) : (
            <button 
              onClick={generateInvite} 
              disabled={loading} 
              className="w-full bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 py-3 rounded-xl font-bold transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : 'Generate Invite Code'}
            </button>
          )}
          <p className="text-[10px] text-gray-500 mt-3 italic text-center">Give this code to friends so they can join via the Compass icon.</p>
        </div>

        <form onSubmit={handleUpdate} className="space-y-6">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 block mb-2">Server Name</label>
            <input 
              className="w-full px-4 py-3 bg-surface-container-lowest shadow-inner rounded-xl border border-transparent focus:border-primary focus:ring-2 focus:ring-primary focus-visible:outline-none outline-none transition-all text-on-surface font-medium"
              type="text" 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
            />
          </div>
          
          <div className="flex flex-col gap-3 pt-4 border-t border-white/5">
            <button 
              type="submit" 
              className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary-fixed font-bold py-3.5 px-6 rounded-xl hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            >
              <Save size={18} aria-hidden="true" />
              Save Changes
            </button>
            
            <div className="flex gap-3">
              <button 
                type="button" 
                onClick={onClose} 
                className="flex-1 bg-white/5 text-on-surface-variant hover:text-white hover:bg-white/10 font-bold py-3.5 px-6 rounded-xl transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
              >
                Cancel
              </button>
              <button 
                type="button" 
                onClick={handleDelete} 
                className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 py-3.5 rounded-xl font-bold transition-all cursor-pointer flex items-center justify-center gap-2 border border-red-500/10 focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:outline-none"
              >
                <Trash2 size={18} aria-hidden="true" />
                Delete
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
