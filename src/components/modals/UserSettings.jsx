import { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'
import { Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

export default function UserSettingsModal({ session, onClose }) {
  const [loading, setLoading] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [username, setUsername] = useState(session?.user?.user_metadata?.username || '')
  const [uniqueTag, setUniqueTag] = useState(session?.user?.user_metadata?.unique_tag || '')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    async function getProfile() {
      const { data } = await supabase.from('profiles').select('avatar_url, username, unique_tag').eq('id', session.user.id).single()
      if (data) {
        setAvatarUrl(data.avatar_url)
        if (data.username) setUsername(data.username)
        if (data.unique_tag) setUniqueTag(data.unique_tag)
      }
    }
    getProfile()
  }, [session.user.id])

  const uploadAvatar = async (event) => {
    try {
      setLoading(true)
      if (!event.target.files || event.target.files.length === 0) throw new Error('You must select an image to upload.')
      const file = event.target.files[0]
      const fileExt = file.name.split('.').pop()
      const fileName = `${session.user.id}-${Math.random()}.${fileExt}`
      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file)
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName)
      const { error: updateError } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', session.user.id)
      if (updateError) throw updateError
      await supabase.auth.updateUser({ data: { avatar_url: publicUrl } })
      setAvatarUrl(publicUrl)
      toast.success('Avatar updated successfully')
    } catch (error) { toast.error(error.message) }
    finally { setLoading(false) }
  }

  const updateProfile = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await supabase.auth.updateUser({ data: { username: username } })
      await supabase.from('profiles').update({ username }).eq('id', session.user.id)
      toast.success('Profile updated')
      onClose()
    } catch { toast.error('Failed to update profile') }
    finally { setLoading(false) }
  }

  const fullTag = uniqueTag.includes('#') ? uniqueTag : `${username || 'User'}#0000`
  const displayTagNumber = fullTag.split('#')[1]

  const copyTag = () => {
    navigator.clipboard.writeText(fullTag)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 sm:p-6 overflow-hidden">
      <div className="bg-white/[0.03] backdrop-blur-[12px] outline outline-1 outline-[rgba(70,72,77,0.15)] text-white p-8 rounded-[2rem] w-full max-w-xl shadow-2xl relative flex flex-col max-h-[90vh]">
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-[#85adff]/10 to-transparent pointer-events-none rounded-t-[2rem]" />
        
        <button onClick={onClose} className="absolute top-6 right-6 text-slate-400 hover:text-white hover:bg-white/10 p-2 rounded-full transition-all cursor-pointer z-[110]">
          <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200" }}>close</span>
        </button>
        
        <h2 className="text-3xl font-bold mb-8 tracking-tight z-10 font-headline">My Account</h2>
        
        <div className="overflow-y-auto custom-scrollbar flex-1 -mx-2 px-2 z-10 relative">
          <div className="flex items-center gap-6 mb-10 bg-white/[0.02] p-6 rounded-3xl border border-white/5 shadow-inner">
            <div className="relative group cursor-pointer shrink-0">
              <div className="h-28 w-28 rounded-full bg-[#111318] flex items-center justify-center border-2 border-[#85adff] shadow-[0_0_20px_rgba(133,173,255,0.2)] overflow-hidden">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  <span className="material-symbols-outlined text-5xl text-slate-500">person</span>
                )}
              </div>
              <label className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-xs font-bold uppercase tracking-wider backdrop-blur-sm">
                <span className="material-symbols-outlined text-[24px] mb-1">upload</span>
                <span className="text-white">Change</span>
                <input type="file" accept="image/*" onChange={uploadAvatar} disabled={loading} className="hidden" />
              </label>
            </div>
            <div className="flex flex-col">
              <h3 className="text-2xl font-bold text-white mb-1 font-headline">{username}</h3>
              <div className="inline-flex items-center gap-2 bg-[#0c0e12] border border-white/5 px-3 py-1.5 rounded-lg w-fit">
                <span className="text-slate-400 text-sm font-medium">{fullTag.split('#')[0]}</span>
                <span className="text-slate-600">#</span>
                <span className="text-[#85adff] font-mono font-bold tracking-wider">{displayTagNumber}</span>
              </div>
            </div>
          </div>

          <form onSubmit={updateProfile} className="space-y-6 mb-10">
            <div className="bg-white/[0.02] p-6 rounded-3xl border border-white/5 space-y-5">
              <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2 font-label">
                <span className="material-symbols-outlined text-[16px]">person</span> Profile Details
              </h4>
              
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1 mb-2 block font-label">Account ID (For adding friends)</label>
                <div className="flex items-center bg-[#0c0e12] rounded-2xl border border-white/5 focus-within:border-white/10 transition-all overflow-hidden p-1 shadow-inner">
                  <input className="w-full px-4 py-3 bg-transparent text-slate-400 cursor-not-allowed outline-none select-all font-mono" type="text" value={fullTag} disabled />
                  <button type="button" onClick={copyTag} className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-slate-400 hover:text-white mr-1 cursor-pointer">
                    <span className={`material-symbols-outlined text-[18px] ${copied ? 'text-emerald-400' : ''}`}>{copied ? 'check' : 'content_copy'}</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1 mb-2 block font-label">Display Name</label>
                <input 
                  className="w-full px-5 py-4 bg-[#0c0e12] rounded-2xl border border-white/5 focus:border-[#85adff] outline-none transition-all text-white font-medium text-lg shadow-inner"
                  type="text" 
                  value={username} 
                  onChange={(e) => setUsername(e.target.value)} 
                />
              </div>
            </div>
            
            <div className="flex justify-end pt-2">
              <button type="submit" disabled={loading} className="bg-gradient-to-r from-[#85adff] to-[#6e9fff] text-[#002a62] px-8 py-3.5 rounded-full font-headline font-bold hover:scale-105 active:scale-95 transition-all shadow-lg shadow-[#85adff]/20 cursor-pointer disabled:opacity-50 flex items-center gap-2">
                {loading ? <Loader2 size={18} className="animate-spin" /> : 'Save Changes'}
              </button>
            </div>
          </form>

          <div className="bg-error/5 p-6 rounded-3xl border border-error/10">
            <h4 className="text-sm font-bold text-error uppercase tracking-widest mb-4 flex items-center gap-2 font-label">
              <span className="material-symbols-outlined text-[16px]">warning</span> Danger Zone
            </h4>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h5 className="text-white font-bold mb-1">Deactivate Account</h5>
                <p className="text-xs text-slate-400">Temporarily disable your account.</p>
              </div>
              <button type="button" onClick={() => toast.error('Deactivation requires email confirmation.')} className="bg-transparent border border-error/50 text-error hover:bg-error hover:text-on-error px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer">
                <span className="material-symbols-outlined text-[16px]">warning</span>
                Deactivate
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
