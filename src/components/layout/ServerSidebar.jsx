import { useState } from 'react'
import { X, Hash, Volume2, Settings, Plus, Search, Users, Crown, Shield } from 'lucide-react'

export default function ServerSidebar({ 
  servers, 
  activeServer, 
  channels, 
  onServerSelect, 
  onChannelSelect,
  onCreateServer,
  onCreateChannel,
  onOpenSettings
}) {
  const [serverDropdown, setServerDropdown] = useState(null)
  const [showChannelCreate, setShowChannelCreate] = useState(false)

  const handleServerRightClick = (e, serverId) => {
    e.preventDefault()
    setServerDropdown({
      serverId,
      x: e.clientX,
      y: e.clientY
    })
  }

  const getChannelIcon = (type) => {
    switch (type) {
      case 'voice':
        return <Volume2 size={16} />
      default:
        return <Hash size={16} />
    }
  }

  return (
    <div className="flex">
      {/* Server List */}
      <div className="w-20 bg-[var(--bg-surface)] flex flex-col">
        <div className="flex-1 pt-3">
          <div className="space-y-2 px-2">
            {/* Add Server Button */}
            <button
              onClick={onCreateServer}
              className="w-12 h-12 bg-[var(--bg-element)] rounded-2xl flex items-center justify-center text-green-400 hover:bg-green-500/20 hover:text-green-300 transition-all cursor-pointer group"
              title="Add Server"
            >
              <Plus size={24} className="group-hover:scale-110 transition-transform" />
            </button>

            {/* Server Icons */}
            {servers.map(server => (
              <div key={server.id} className="relative group">
                <button
                  onClick={() => onServerSelect(server)}
                  onContextMenu={(e) => handleServerRightClick(e, server.id)}
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center overflow-hidden transition-all cursor-pointer ${
                    activeServer?.id === server.id
                      ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30'
                      : 'bg-[var(--bg-element)] text-[var(--text-muted)] hover:bg-[var(--bg-base)] hover:text-[var(--text-main)]'
                  }`}
                  title={server.name}
                >
                  {server.icon_url ? (
                    <img 
                      src={server.icon_url} 
                      alt={server.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-lg font-bold">
                      {server.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </button>

                {/* Server Indicator */}
                {activeServer?.id === server.id && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full -ml-2" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* User Avatar */}
        <div className="p-2">
          <button
            onClick={onOpenSettings}
            className="w-12 h-12 bg-[var(--bg-element)] rounded-2xl flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--bg-base)] hover:text-[var(--text-main)] transition-all cursor-pointer"
            title="User Settings"
          >
            <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
              U
            </div>
          </button>
        </div>
      </div>

      {/* Channel Sidebar (when server is selected) */}
      {activeServer && (
        <div className="w-60 bg-[var(--bg-base)] flex flex-col">
          {/* Server Header */}
          <div className="h-12 px-4 flex items-center justify-between border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              {activeServer.icon_url ? (
                <img 
                  src={activeServer.icon_url} 
                  alt={activeServer.name}
                  className="w-6 h-6 rounded"
                />
              ) : (
                <div className="w-6 h-6 bg-indigo-500 rounded flex items-center justify-center text-white text-xs font-bold">
                  {activeServer.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="font-bold text-[var(--text-main)]">{activeServer.name}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowChannelCreate(true)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-element)] rounded transition-colors cursor-pointer"
                title="Create Channel"
              >
                <Plus size={16} />
              </button>
              <button className="p-1 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-element)] rounded transition-colors cursor-pointer">
                <Search size={16} />
              </button>
            </div>
          </div>

          {/* Channel List */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-2 pt-4">
              <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 px-2">
                Text Channels
              </div>
              <div className="space-y-1">
                {channels
                  .filter(ch => ch.type === 'text')
                  .map(channel => (
                    <button
                      key={channel.id}
                      onClick={() => onChannelSelect(channel)}
                      className="w-full flex items-center gap-2 px-2 py-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer text-sm group"
                    >
                      {getChannelIcon(channel.type)}
                      <span className="truncate">{channel.name}</span>
                    </button>
                  ))}
              </div>
            </div>

            {channels.some(ch => ch.type === 'voice') && (
              <div className="px-2 pt-4">
                <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 px-2">
                  Voice Channels
                </div>
                <div className="space-y-1">
                  {channels
                    .filter(ch => ch.type === 'voice')
                    .map(channel => (
                      <button
                        key={channel.id}
                        className="w-full flex items-center gap-2 px-2 py-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer text-sm group"
                      >
                        {getChannelIcon(channel.type)}
                        <span className="truncate">{channel.name}</span>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* Server Members (collapsed) */}
          <div className="h-12 border-t border-[var(--border-subtle)] px-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-[var(--text-muted)]" />
              <span className="text-sm text-[var(--text-secondary)]">Members</span>
            </div>
            <button className="text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer">
              <Plus size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Server Dropdown Menu */}
      {serverDropdown && (
        <div
          className="fixed z-50 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg shadow-2xl py-2 min-w-48"
          style={{
            left: `${serverDropdown.x}px`,
            top: `${serverDropdown.y}px`
          }}
          onClick={() => setServerDropdown(null)}
        >
          <button className="w-full px-4 py-2 text-left text-[var(--text-main)] hover:bg-[var(--bg-element)] transition-colors cursor-pointer text-sm">
            <Settings size={16} className="inline mr-2" />
            Server Settings
          </button>
          <button className="w-full px-4 py-2 text-left text-[var(--text-main)] hover:bg-[var(--bg-element)] transition-colors cursor-pointer text-sm">
            <Users size={16} className="inline mr-2" />
            Invite People
          </button>
          <div className="border-t border-[var(--border-subtle)] my-2" />
          <button className="w-full px-4 py-2 text-left text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer text-sm">
            Leave Server
          </button>
        </div>
      )}
    </div>
  )
}
