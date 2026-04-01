import { useState } from 'react'
import { X, Copy, Check, Users, Link, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ServerInviteModal({ 
  onClose, 
  server, 
  onGenerateInvite,
  existingInvites = [] 
}) {
  const [inviteCode, setInviteCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('create')

  const generateNewInvite = async () => {
    setLoading(true)
    try {
      const code = await onGenerateInvite(server.id)
      setInviteCode(code)
      setActiveTab('invite')
    } catch (error) {
      console.error('Failed to generate invite:', error)
    } finally {
      setLoading(false)
    }
  }

  const copyInviteLink = () => {
    const inviteUrl = `${window.location.origin}?invite=${inviteCode}`
    navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    toast.success('Invite link copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  const copyInviteCode = (code) => {
    navigator.clipboard.writeText(code)
    toast.success('Invite code copied!')
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const getInviteStatus = (invite) => {
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return { text: 'Expired', color: 'text-red-400' }
    }
    if (invite.max_uses && invite.uses >= invite.max_uses) {
      return { text: 'Full', color: 'text-yellow-400' }
    }
    if (!invite.active) {
      return { text: 'Disabled', color: 'text-gray-400' }
    }
    return { text: 'Active', color: 'text-green-400' }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-[var(--bg-surface)] w-full max-w-2xl rounded-3xl border border-[var(--border-subtle)] shadow-2xl p-6 animate-slide-up">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center">
              <Users size={24} className="text-indigo-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-[var(--text-main)]">Invite People</h2>
              <p className="text-sm text-[var(--text-secondary)]">{server.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-element)] rounded-lg transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex gap-2 mb-6 border-b border-[var(--border-subtle)]">
          <button
            onClick={() => setActiveTab('create')}
            className={`px-4 py-2 font-medium transition-colors cursor-pointer border-b-2 ${
              activeTab === 'create'
                ? 'text-indigo-400 border-indigo-400'
                : 'text-[var(--text-secondary)] border-transparent hover:text-[var(--text-main)]'
            }`}
          >
            Create Invite
          </button>
          <button
            onClick={() => setActiveTab('existing')}
            className={`px-4 py-2 font-medium transition-colors cursor-pointer border-b-2 ${
              activeTab === 'existing'
                ? 'text-indigo-400 border-indigo-400'
                : 'text-[var(--text-secondary)] border-transparent hover:text-[var(--text-main)]'
            }`}
          >
            Existing Invites ({existingInvites.length})
          </button>
        </div>

        {activeTab === 'create' && (
          <div className="space-y-6">
            {!inviteCode ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Link size={32} className="text-indigo-400" />
                </div>
                <h3 className="text-lg font-semibold text-[var(--text-main)] mb-2">
                  Create a New Invite
                </h3>
                <p className="text-[var(--text-secondary)] mb-6">
                  Share this link with anyone to invite them to your server
                </p>
                <button
                  onClick={generateNewInvite}
                  disabled={loading}
                  className="px-6 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 mx-auto"
                >
                  {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  Generate Invite Link
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-[var(--bg-element)] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-[var(--text-main)]">Invite Link</span>
                    <span className="text-xs text-green-400">Active</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={`${window.location.origin}?invite=${inviteCode}`}
                      readOnly
                      className="flex-1 px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-main)] text-sm font-mono"
                    />
                    <button
                      onClick={copyInviteLink}
                      className="p-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-colors cursor-pointer"
                    >
                      {copied ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>

                <div className="bg-[var(--bg-element)] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-[var(--text-main)]">Invite Code</span>
                    <button
                      onClick={() => copyInviteCode(inviteCode)}
                      className="p-1 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                  <div className="px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg">
                    <code className="text-[var(--text-main)] font-mono text-lg">{inviteCode}</code>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setInviteCode('')}
                    className="flex-1 px-4 py-2 bg-[var(--bg-element)] hover:bg-[var(--bg-hover)] text-[var(--text-main)] rounded-lg transition-colors cursor-pointer"
                  >
                    Create Another
                  </button>
                  <button
                    onClick={onClose}
                    className="flex-1 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-colors cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'existing' && (
          <div className="space-y-4">
            {existingInvites.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-[var(--text-secondary)]">No existing invites</p>
                <button
                  onClick={() => setActiveTab('create')}
                  className="mt-4 text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                >
                  Create your first invite
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {existingInvites.map((invite) => {
                  const status = getInviteStatus(invite)
                  return (
                    <div key={invite.id} className="bg-[var(--bg-element)] rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <code className="text-[var(--text-main)] font-mono font-medium">{invite.code}</code>
                            <span className={`text-xs font-medium ${status.color}`}>{status.text}</span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-[var(--text-secondary)]">
                            <span>Uses: {invite.uses}{invite.max_uses ? `/${invite.max_uses}` : ''}</span>
                            <span>Created: {formatDate(invite.created_at)}</span>
                            {invite.expires_at && (
                              <span>Expires: {formatDate(invite.expires_at)}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => copyInviteCode(invite.code)}
                            className="p-2 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] rounded-lg transition-colors cursor-pointer"
                          >
                            <Copy size={16} />
                          </button>
                          <button className="p-2 text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer">
                            <X size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
