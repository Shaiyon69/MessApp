import { useState } from 'react'
import { X, Hash, Volume2, Lock, Eye, EyeOff, Users, Zap } from 'lucide-react'
import toast from 'react-hot-toast'

export default function CreateChannelModal({ 
  onClose, 
  onCreateChannel, 
  serverId,
  existingChannels = [] 
}) {
  const [channelData, setChannelData] = useState({
    name: '',
    type: 'text',
    description: '',
    position: existingChannels.length,
    nsfw: false
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!channelData.name.trim()) {
      toast.error('Channel name is required')
      return
    }

    // Check for duplicate names
    const nameExists = existingChannels.some(
      ch => ch.name.toLowerCase() === channelData.name.toLowerCase() && ch.type === channelData.type
    )
    
    if (nameExists) {
      toast.error(`A ${channelData.type} channel with this name already exists`)
      return
    }

    setLoading(true)
    try {
      await onCreateChannel(channelData)
      onClose()
    } catch (error) {
      console.error('Failed to create channel:', error)
    } finally {
      setLoading(false)
    }
  }

  const channelTypes = [
    {
      value: 'text',
      label: 'Text Channel',
      icon: <Hash size={16} />,
      description: 'Send messages, images, and files'
    },
    {
      value: 'voice',
      label: 'Voice Channel',
      icon: <Volume2 size={16} />,
      description: 'Talk, video, and screen share'
    }
  ]

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-[var(--bg-surface)] w-full max-w-md rounded-3xl border border-[var(--border-subtle)] shadow-2xl p-6 animate-slide-up">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-[var(--text-main)]">Create Channel</h2>
          <button
            onClick={onClose}
            className="p-2 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-element)] rounded-lg transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-[var(--text-main)] mb-3">
              Channel Type
            </label>
            <div className="space-y-2">
              {channelTypes.map((type) => (
                <label
                  key={type.value}
                  className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition-colors ${
                    channelData.type === type.value
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-element)] hover:bg-[var(--bg-surface)]'
                  }`}
                >
                  <input
                    type="radio"
                    name="type"
                    value={type.value}
                    checked={channelData.type === type.value}
                    onChange={(e) => setChannelData(prev => ({ ...prev, type: e.target.value }))}
                    className="sr-only"
                  />
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    channelData.type === type.value ? 'bg-indigo-500 text-white' : 'bg-[var(--bg-base)] text-[var(--text-muted)]'
                  }`}>
                    {type.icon}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-[var(--text-main)]">{type.label}</div>
                    <div className="text-sm text-[var(--text-secondary)]">{type.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-main)] mb-2">
              Channel Name
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                {channelData.type === 'text' ? <Hash size={16} /> : <Volume2 size={16} />}
              </div>
              <input
                type="text"
                value={channelData.name}
                onChange={(e) => setChannelData(prev => ({ ...prev, name: e.target.value }))}
                className="w-full pl-10 pr-4 py-3 bg-[var(--bg-element)] border border-[var(--border-subtle)] rounded-xl focus:border-indigo-500 focus:outline-none transition-colors text-[var(--text-main)]"
                placeholder={channelData.type === 'text' ? 'general' : 'General Voice'}
                maxLength={100}
                required
              />
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Lowercase, no spaces or periods. Use hyphens instead.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-main)] mb-2">
              Description (Optional)
            </label>
            <textarea
              value={channelData.description}
              onChange={(e) => setChannelData(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-4 py-3 bg-[var(--bg-element)] border border-[var(--border-subtle)] rounded-xl focus:border-indigo-500 focus:outline-none transition-colors text-[var(--text-main)] resize-none"
              placeholder="What's this channel about?"
              rows={2}
              maxLength={1024}
            />
          </div>

          {channelData.type === 'text' && (
            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={channelData.nsfw}
                    onChange={(e) => setChannelData(prev => ({ ...prev, nsfw: e.target.checked }))}
                    className="w-4 h-4 text-indigo-500 bg-[var(--bg-element)] border-[var(--border-subtle)] rounded focus:ring-indigo-500 focus:ring-2"
                  />
                  <div className="flex items-center gap-2">
                    <EyeOff size={16} className="text-red-400" />
                    <span className="text-sm font-medium text-[var(--text-main)]">NSFW Channel</span>
                  </div>
                </label>
                <p className="text-xs text-[var(--text-muted)] mt-1 ml-7">
                  Channel must be age-restricted and inaccessible to underage users
                </p>
              </div>
            </div>
          )}

          <div className="bg-[var(--bg-element)] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap size={16} className="text-yellow-400" />
              <span className="text-sm font-medium text-[var(--text-main)]">Pro Tip</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              {channelData.type === 'text' 
                ? 'Great text channels have clear names, descriptions, and focused topics. Consider organizing by topic, project, or team.'
                : 'Voice channels work best with 2-10 people. Create separate channels for different topics or groups to keep conversations organized.'
              }
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 bg-[var(--bg-element)] hover:bg-[var(--bg-hover)] text-[var(--text-main)] rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !channelData.name.trim()}
              className="px-6 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              Create Channel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
