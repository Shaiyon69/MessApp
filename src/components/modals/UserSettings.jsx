import { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'
import { X, Upload, Loader2, User } from 'lucide-react'

export default function UserSettingsModal({ session, onClose }) {
  const [loading, setLoading] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [username, setUsername] = useState(session?.user?.user_metadata?.username || '')
  const [uniqueTag, setUniqueTag] = useState(session?.user?.user_metadata?.unique_tag || 'Loading...')

  useEffect(() => {
    async function getProfile() {
      const { data } = await supabase
        .from('profiles')
        .select('avatar_url, username, unique_tag')
        .eq('id', session.user.id)
        .single()
      
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
      if (!event.target.files || event.target.files.length === 0) {
        throw new Error('You must select an image to upload.')
      }

      const file = event.target.files[0]
      const fileExt = file.name.split('.').pop()
      const fileName = `${session.user.id}-${Math.random()}.${fileExt}`
      const filePath = `${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      // 1. Update the database
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', session.user.id)

      if (updateError) throw updateError

      // 2. Sync with the active local session so the Dashboard updates instantly!
      await supabase.auth.updateUser({
        data: { avatar_url: publicUrl }
      })

      setAvatarUrl(publicUrl)
    } catch (error) {
      alert(error.message)
    } finally {
      setLoading(false)
    }
  }

  const updateProfile = async (e) => {
    e.preventDefault()
    setLoading(true)
    
    // We ONLY update the username, never the unique_tag
    await supabase.auth.updateUser({
      data: { username: username }
    })

    await supabase
      .from('profiles')
      .update({ username })
      .eq('id', session.user.id)

    setLoading(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900/90 backdrop-blur-xl border border-white/10 text-white p-8 rounded-3xl w-full max-w-md shadow-2xl relative">
        <button onClick={onClose} className="absolute top-6 right-6 text-gray-400 hover:text-white transition-colors cursor-pointer">
          <X size={24} />
        </button>
        
        <h3 className="text-3xl font-bold mb-8 tracking-tight">My Profile</h3>
        
        <div className="flex flex-col items-center mb-8">
          <div className="relative group cursor-pointer">
            <div className="h-24 w-24 rounded-full bg-gradient-to-tr from-gray-700 to-gray-600 flex items-center justify-center border-4 border-gray-800 shadow-xl overflow-hidden mb-4">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                <User size={40} className="text-gray-400" />
              )}
            </div>
            <label className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-xs font-bold uppercase tracking-wider h-24 w-24 border-4 border-transparent">
              <Upload size={20} className="mb-1" />
              Change
              <input 
                type="file" 
                accept="image/*" 
                onChange={uploadAvatar} 
                disabled={loading}
                className="hidden" 
              />
            </label>
          </div>
          {loading && <div className="flex items-center gap-2 text-primary text-sm font-medium"><Loader2 size={16} className="animate-spin" /> Uploading...</div>}
        </div>

        <form onSubmit={updateProfile}>
          {/* Immutable Account ID */}
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Account ID (Cannot be changed)</label>
          <input 
            className="w-full px-4 py-3 mt-2 mb-4 bg-black/50 rounded-xl border border-white/5 text-gray-500 cursor-not-allowed outline-none select-all" 
            type="text" 
            value={uniqueTag} 
            disabled 
          />

          {/* Mutable Display Name */}
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Display Name</label>
          <input 
            className="w-full px-4 py-3 mt-2 mb-8 bg-black/30 rounded-xl border border-white/5 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-white" 
            type="text" 
            value={username} 
            onChange={(e) => setUsername(e.target.value)} 
          />
          
          <div className="flex justify-end">
            <button 
              type="submit" 
              disabled={loading}
              className="bg-primary text-white px-8 py-3 rounded-xl font-bold hover:bg-opacity-90 transition-all shadow-lg shadow-primary/30 cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
