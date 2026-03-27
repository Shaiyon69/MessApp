import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { X, Copy, Check, Loader2, Trash2, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { generateSecureRandomString } from '../../lib/crypto'

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
    const newCode = `MS-${generateSecureRandomString(6)}`

    const { data, error } = await supabase
      .from('invites')
      .insert([{ server_id: activeServer.id, creator_id: session.user.id, code: newCode }])
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
    toast.success('Invite code copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex flex-col justify-end md:justify-center items-center z-[100] p-0 md:p-4">
      <div className="bg-[#15171a] border border-[#23252a] text-white p-6 md:p-8 rounded-t-3xl md:rounded-3xl w-full max-w-md shadow-2xl animate-slide-up md:animate-fade-in pb-10 md:pb-8 flex flex-col max-h-[90vh]">
        
        <div className="flex justify-between items-center mb-6 md:mb-8">
          <h3 className="text-2xl md:text-3xl font-bold tracking-tight">Server Overview</h3>
          <button onClick={onClose} className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white transition-colors cursor-pointer md:hidden">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto custom-scrollbar pr-2">
          {/* Invite Section */}
          <div className="bg-[#1c1e22] p-5 rounded-2xl border border-[#23252a] mb-6 shadow-sm">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 block mb-2">Invite Friends</label>
            <div className="flex items-center bg-[#0d0f12] rounded-xl overflow-hidden border border-[#23252a] h-14 shadow-inner">
              <input 
                className="flex-1 px-4 bg-transparent text-white font-mono outline-none w-full" 
                value={inviteCode || 'Generate a link to share'} 
                readOnly 
              />
              {inviteCode ? (
                <button type="button" onClick={copyToClipboard} className="p-4 bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors flex items-center justify-center h-full border-l border-[#23252a] cursor-pointer">
                  {copied ? <Check size={20} className="text-green-400" /> : <Copy size={20} className="text-indigo-400" />}
                </button>
              ) : (
                <button type="button" onClick={generateInvite} disabled={loading} className="px-6 bg-indigo-500 hover:bg-indigo-600 transition-colors flex items-center justify-center h-full cursor-pointer disabled:opacity-50">
                  {loading ? <Loader2 className="animate-spin text-white" size={20} /> : <span className="text-white font-bold text-sm">Generate</span>}
                </button>
              )}
            </div>
          </div>

          {/* Settings Form */}
          <div className="bg-[#1c1e22] p-5 rounded-2xl border border-[#23252a] shadow-sm">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 block mb-2">Server Name</label>
            <div className="bg-[#0d0f12] rounded-xl border border-[#23252a] h-14 focus-within:border-indigo-500 transition-colors shadow-inner px-4 flex items-center mb-6">
              <input 
                className="bg-transparent border-none outline-none w-full text-white font-medium" 
                type="text" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
              />
            </div>
            
            <div className="flex flex-col gap-3 pt-4 border-t border-[#23252a]">
              <button 
                type="button" 
                onClick={handleUpdate}
                className="w-full bg-indigo-500 text-white py-4 md:py-3 rounded-xl font-bold hover:bg-indigo-600 transition-all shadow-lg cursor-pointer flex items-center justify-center gap-2"
              >
                <Save size={18} /> Save Changes
              </button>
              
              <div className="flex flex-col md:flex-row gap-3">
                <button 
                  type="button" 
                  onClick={onClose} 
                  className="flex-1 bg-white/5 hover:bg-white/10 text-gray-300 py-4 md:py-3 rounded-xl font-bold transition-all cursor-pointer hidden md:block"
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  onClick={handleDelete} 
                  className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 py-4 md:py-3 rounded-xl font-bold transition-all cursor-pointer flex items-center justify-center gap-2 border border-red-500/20"
                >
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
