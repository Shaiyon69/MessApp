import { useState } from 'react'
import { X, Plus, Hash, Volume2, Settings, Lock, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'

export default function CreateServerModal({ onClose, onCreateServer }) {
  const [step, setStep] = useState(1)
  const [serverData, setServerData] = useState({
    name: '',
    icon_url: '',
    description: ''
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!serverData.name.trim()) {
      toast.error('Server name is required')
      return
    }

    setLoading(true)
    try {
      await onCreateServer(serverData)
      onClose()
    } catch (error) {
      console.error('Failed to create server:', error)
    } finally {
      setLoading(false)
    }
  }

  const serverTemplates = [
    {
      name: 'Gaming Community',
      icon: '🎮',
      description: 'For gaming enthusiasts and teams',
      channels: ['general', 'lfg', 'screenshots']
    },
    {
      name: 'Study Group',
      icon: '📚',
      description: 'For students and learners',
      channels: ['general', 'homework-help', 'resources']
    },
    {
      name: 'Creative Hub',
      icon: '🎨',
      description: 'For artists and creators',
      channels: ['general', 'showcase', 'collaboration']
    },
    {
      name: 'Tech Talk',
      icon: '💻',
      description: 'For developers and tech enthusiasts',
      channels: ['general', 'code-help', 'projects']
    }
  ]

  const selectTemplate = (template) => {
    setServerData({
      name: template.name,
      icon_url: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="50" font-size="50" text-anchor="middle">${template.icon}</text></svg>`)}`,
      description: template.description
    })
    setStep(2)
  }

  if (step === 1) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
        <div className="bg-[var(--bg-surface)] w-full max-w-2xl rounded-3xl border border-[var(--border-subtle)] shadow-2xl p-6 animate-slide-up">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-[var(--text-main)]">Create Your Server</h2>
            <button
              onClick={onClose}
              className="p-2 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-element)] rounded-lg transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>

          <div className="mb-6">
            <p className="text-[var(--text-secondary)] mb-4">
              Start with a template or create your own custom server
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {serverTemplates.map((template, index) => (
                <button
                  key={index}
                  onClick={() => selectTemplate(template)}
                  className="p-4 bg-[var(--bg-element)] border border-[var(--border-subtle)] rounded-xl hover:bg-[var(--bg-surface)] hover:border-indigo-500 transition-all cursor-pointer text-left group"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="text-2xl">{template.icon}</div>
                    <h3 className="font-semibold text-[var(--text-main)] group-hover:text-indigo-400 transition-colors">
                      {template.name}
                    </h3>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)]">{template.description}</p>
                  <div className="mt-2 text-xs text-[var(--text-muted)]">
                    Channels: {template.channels.join(', ')}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-between items-center">
            <button
              onClick={() => setStep(2)}
              className="px-6 py-2 text-[var(--text-secondary)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
            >
              Create Custom Server
            </button>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-[var(--bg-element)] hover:bg-[var(--bg-hover)] text-[var(--text-main)] rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-[var(--bg-surface)] w-full max-w-md rounded-3xl border border-[var(--border-subtle)] shadow-2xl p-6 animate-slide-up">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-[var(--text-main)]">Customize Server</h2>
          <button
            onClick={onClose}
            className="p-2 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-element)] rounded-lg transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-[var(--text-main)] mb-2">
              Server Name
            </label>
            <input
              type="text"
              value={serverData.name}
              onChange={(e) => setServerData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-4 py-3 bg-[var(--bg-element)] border border-[var(--border-subtle)] rounded-xl focus:border-indigo-500 focus:outline-none transition-colors text-[var(--text-main)]"
              placeholder="Enter server name"
              maxLength={100}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-main)] mb-2">
              Description (Optional)
            </label>
            <textarea
              value={serverData.description}
              onChange={(e) => setServerData(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-4 py-3 bg-[var(--bg-element)] border border-[var(--border-subtle)] rounded-xl focus:border-indigo-500 focus:outline-none transition-colors text-[var(--text-main)] resize-none"
              placeholder="Tell people what your server is about"
              rows={3}
              maxLength={500}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-main)] mb-2">
              Server Icon (Optional)
            </label>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-[var(--bg-element)] border-2 border-dashed border-[var(--border-subtle)] rounded-xl flex items-center justify-center">
                {serverData.icon_url ? (
                  <img src={serverData.icon_url} alt="Server icon" className="w-full h-full rounded-xl object-cover" />
                ) : (
                  <span className="text-2xl text-[var(--text-muted)]">🏢</span>
                )}
              </div>
              <div className="flex-1">
                <input
                  type="url"
                  value={serverData.icon_url}
                  onChange={(e) => setServerData(prev => ({ ...prev, icon_url: e.target.value }))}
                  className="w-full px-4 py-2 bg-[var(--bg-element)] border border-[var(--border-subtle)] rounded-lg focus:border-indigo-500 focus:outline-none transition-colors text-[var(--text-main)] text-sm"
                  placeholder="Enter image URL"
                />
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Recommended: 512x512px image
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-between pt-4">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="px-6 py-2 text-[var(--text-secondary)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
            >
              Back
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 bg-[var(--bg-element)] hover:bg-[var(--bg-hover)] text-[var(--text-main)] rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !serverData.name.trim()}
                className="px-6 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                Create Server
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
