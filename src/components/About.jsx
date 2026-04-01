import { useState } from 'react'
import { X, Info, Shield, Lock, MessageSquare, Code, ExternalLink, Github, Globe, CheckCircle } from 'lucide-react'

export default function About({ onClose }) {
  const [activeTab, setActiveTab] = useState('about')

  const tabs = [
    { id: 'about', name: 'About', icon: <Info className="w-4 h-4" /> },
    { id: 'security', name: 'Security', icon: <Shield className="w-4 h-4" /> },
    { id: 'credits', name: 'Credits', icon: <Code className="w-4 h-4" /> }
  ]

  const appInfo = {
    version: '1.0.0',
    build: '20260401',
    platform: typeof window !== 'undefined' ? 'Web' : 'Unknown',
    capacitor: typeof window !== 'undefined' && window.Capacitor ? window.Capacitor.getPlatform() : null
  }

  const securityFeatures = [
    { name: 'End-to-End Encryption', description: 'AES-GCM-256 encryption for all messages' },
    { name: 'Key Exchange', description: 'ECDH P-256 curve for secure key exchange' },
    { name: 'PIN Protection', description: 'PBKDF2 with 100k iterations for key backup' },
    { name: 'Zero Access', description: 'We cannot read your messages' },
    { name: 'Open Source', description: 'Transparent cryptography implementation' },
    { name: 'No Tracking', description: 'No analytics or tracking for advertising' }
  ]

  const credits = [
    { name: 'MessApp', role: 'Secure Messaging Platform', description: 'End-to-end encrypted chat application' },
    { name: 'React', role: 'Frontend Framework', description: 'UI framework for web application' },
    { name: 'Supabase', role: 'Backend & Auth', description: 'Database and authentication service' },
    { name: 'Capacitor', role: 'Mobile Framework', description: 'Cross-platform mobile development' },
    { name: 'TailwindCSS', role: 'Styling', description: 'Utility-first CSS framework' },
    { name: 'Lucide Icons', role: 'Icon Library', description: 'Beautiful icon set' }
  ]

  const renderAboutTab = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <MessageSquare className="w-12 h-12 text-white" />
        </div>
        <h3 className="text-2xl font-bold text-[var(--text-main)] mb-2">MessApp</h3>
        <p className="text-[var(--text-secondary)]">Secure Messaging for Everyone</p>
      </div>

      <div className="bg-[var(--bg-element)] rounded-xl p-4 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-[var(--text-secondary)]">Version</span>
          <span className="text-[var(--text-main)] font-mono">{appInfo.version}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[var(--text-secondary)]">Build</span>
          <span className="text-[var(--text-main)] font-mono">{appInfo.build}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[var(--text-secondary)]">Platform</span>
          <span className="text-[var(--text-main)]">{appInfo.platform}</span>
        </div>
        {appInfo.capacitor && (
          <div className="flex justify-between items-center">
            <span className="text-[var(--text-secondary)]">Device</span>
            <span className="text-[var(--text-main)] capitalize">{appInfo.capacitor}</span>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h4 className="text-lg font-semibold text-[var(--text-main)]">Features</h4>
        <div className="grid grid-cols-1 gap-2">
          {[
            'End-to-end encrypted messaging',
            'Real-time chat with typing indicators',
            'Message reactions and replies',
            'File and image sharing',
            'Cross-platform support',
            'Privacy-focused design'
          ].map((feature, index) => (
            <div key={index} className="flex items-center gap-2 text-[var(--text-secondary)]">
              <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
              <span className="text-sm">{feature}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <button className="flex items-center justify-center gap-2 px-4 py-2 bg-[var(--bg-element)] hover:bg-[var(--bg-surface)] text-[var(--text-main)] rounded-lg transition-colors">
          <Github className="w-4 h-4" />
          View Source Code
        </button>
        <button className="flex items-center justify-center gap-2 px-4 py-2 bg-[var(--bg-element)] hover:bg-[var(--bg-surface)] text-[var(--text-main)] rounded-lg transition-colors">
          <Globe className="w-4 h-4" />
          Visit Website
        </button>
      </div>
    </div>
  )

  const renderSecurityTab = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl flex items-center justify-center mx-auto mb-4">
          <Shield className="w-10 h-10 text-white" />
        </div>
        <h3 className="text-xl font-bold text-[var(--text-main)] mb-2">Security & Privacy</h3>
        <p className="text-[var(--text-secondary)] text-sm">Military-grade encryption for your privacy</p>
      </div>

      <div className="space-y-4">
        {securityFeatures.map((feature, index) => (
          <div key={index} className="bg-[var(--bg-element)] rounded-xl p-4">
            <div className="flex items-start gap-3">
              <Lock className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-[var(--text-main)] font-medium mb-1">{feature.name}</h4>
                <p className="text-[var(--text-secondary)] text-sm">{feature.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-[var(--bg-element)] rounded-xl p-4">
        <h4 className="text-[var(--text-main)] font-medium mb-2">Privacy Commitment</h4>
        <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
          We are committed to protecting your privacy. Your messages are end-to-end encrypted, 
          meaning only you and your recipients can read them. We cannot access your message content, 
          and we do not track you for advertising purposes.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <button className="flex items-center justify-center gap-2 px-4 py-2 bg-[var(--bg-element)] hover:bg-[var(--bg-surface)] text-[var(--text-main)] rounded-lg transition-colors">
          <ExternalLink className="w-4 h-4" />
          Privacy Policy
        </button>
        <button className="flex items-center justify-center gap-2 px-4 py-2 bg-[var(--bg-element)] hover:bg-[var(--bg-surface)] text-[var(--text-main)] rounded-lg transition-colors">
          <ExternalLink className="w-4 h-4" />
          Terms of Service
        </button>
      </div>
    </div>
  )

  const renderCreditsTab = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center mx-auto mb-4">
          <Code className="w-10 h-10 text-white" />
        </div>
        <h3 className="text-xl font-bold text-[var(--text-main)] mb-2">Credits & Licenses</h3>
        <p className="text-[var(--text-secondary)] text-sm">Built with amazing open source technologies</p>
      </div>

      <div className="space-y-3">
        {credits.map((credit, index) => (
          <div key={index} className="bg-[var(--bg-element)] rounded-xl p-4">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-[var(--text-main)] font-medium">{credit.name}</h4>
                <p className="text-[var(--text-secondary)] text-sm">{credit.role}</p>
                <p className="text-[var(--text-muted)] text-xs mt-1">{credit.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-[var(--bg-element)] rounded-xl p-4">
        <h4 className="text-[var(--text-main)] font-medium mb-2">License</h4>
        <p className="text-[var(--text-secondary)] text-sm">
          MessApp is released under the MIT License. Feel free to use, modify, and distribute 
          the software according to the terms of the license.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <button className="flex items-center justify-center gap-2 px-4 py-2 bg-[var(--bg-element)] hover:bg-[var(--bg-surface)] text-[var(--text-main)] rounded-lg transition-colors">
          <Github className="w-4 h-4" />
          View on GitHub
        </button>
        <button className="flex items-center justify-center gap-2 px-4 py-2 bg-[var(--bg-element)] hover:bg-[var(--bg-surface)] text-[var(--text-main)] rounded-lg transition-colors">
          <ExternalLink className="w-4 h-4" />
          View Documentation
        </button>
      </div>
    </div>
  )

  const renderContent = () => {
    switch (activeTab) {
      case 'about':
        return renderAboutTab()
      case 'security':
        return renderSecurityTab()
      case 'credits':
        return renderCreditsTab()
      default:
        return renderAboutTab()
    }
  }

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="bg-[var(--bg-surface)] w-full max-w-2xl max-h-[90vh] rounded-2xl border border-[var(--border-subtle)] shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center">
              <Info className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-xl font-bold text-[var(--text-main)]">About MessApp</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--bg-element)] rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--border-subtle)]">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-[var(--text-main)] border-b-2 border-[var(--theme-base)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {tab.icon}
              <span>{tab.name}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {renderContent()}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-element)] text-center">
          <p className="text-[var(--text-muted)] text-sm">
            © 2026 MessApp. Made with ❤️ for secure communication.
          </p>
        </div>
      </div>
    </div>
  )
}
