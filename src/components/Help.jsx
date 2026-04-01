import { useState } from 'react'
import { X, HelpCircle, Shield, Lock, MessageSquare, ExternalLink, ChevronRight, Search } from 'lucide-react'

export default function Help({ onClose }) {
  const [activeCategory, setActiveCategory] = useState('getting-started')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedFaq, setExpandedFaq] = useState(null)

  const categories = [
    {
      id: 'getting-started',
      name: 'Getting Started',
      icon: <HelpCircle className="w-5 h-5" />,
      color: 'text-blue-400'
    },
    {
      id: 'security',
      name: 'Security & Privacy',
      icon: <Shield className="w-5 h-5" />,
      color: 'text-green-400'
    },
    {
      id: 'encryption',
      name: 'Encryption',
      icon: <Lock className="w-5 h-5" />,
      color: 'text-purple-400'
    },
    {
      id: 'messaging',
      name: 'Messaging',
      icon: <MessageSquare className="w-5 h-5" />,
      color: 'text-indigo-400'
    }
  ]

  const faqData = {
    'getting-started': [
      {
        question: 'How do I create an account?',
        answer: 'Simply click "Sign Up" and enter your email address. You\'ll receive a verification link to complete registration. No phone number required!'
      },
      {
        question: 'What is the PIN for?',
        answer: 'The 6-digit PIN encrypts your private keys for secure cloud backup. This allows you to recover your messages on new devices. Make sure to remember it!'
      },
      {
        question: 'How do I add contacts?',
        answer: 'Click the "New Chat" button and enter the email address of the person you want to message. They\'ll need to be registered on MessApp.'
      },
      {
        question: 'Can I use MessApp on multiple devices?',
        answer: 'Yes! Your account syncs across devices. Use your PIN to restore your encryption keys on new devices.'
      }
    ],
    'security': [
      {
        question: 'Is MessApp really private?',
        answer: 'Yes! We use end-to-end encryption, meaning only you and your recipients can read your messages. We cannot access your message content.'
      },
      {
        question: 'What data do you collect?',
        answer: 'We only collect necessary data for app functionality: email for authentication, public keys for encryption, and anonymous crash reports. No message content or personal tracking.'
      },
      {
        question: 'Are my messages stored securely?',
        answer: 'Messages are encrypted with AES-GCM-256 before storage. Private keys are encrypted with your PIN using PBKDF2 (100k iterations).'
      },
      {
        question: 'Can I delete my messages?',
        answer: 'Yes, you can delete your own messages. Once deleted, they\'re removed from our servers. However, recipients may still have copies.'
      }
    ],
    'encryption': [
      {
        question: 'What encryption does MessApp use?',
        answer: 'We use AES-GCM-256 for message encryption and ECDH P-256 for key exchange. This is the same encryption level used by major banks and governments.'
      },
      {
        question: 'What happens if I forget my PIN?',
        answer: 'Unfortunately, we cannot recover your PIN. Without it, you cannot restore your encrypted backup. You\'ll need to create new encryption keys, but old messages will remain unreadable.'
      },
      {
        question: 'Are my backup files secure?',
        answer: 'Yes. Your private keys are encrypted with your PIN before being stored in the cloud. Without your PIN, the backup is useless.'
      },
      {
        question: 'How does key exchange work?',
        answer: 'When you message someone new, your devices automatically exchange public keys to establish a secure encrypted channel. This happens seamlessly in the background.'
      }
    ],
    'messaging': [
      {
        question: 'How do I send messages?',
        answer: 'Simply type your message and press Enter or click Send. Messages are encrypted before sending and can only be decrypted by the recipient.'
      },
      {
        question: 'Can I send files and images?',
        answer: 'Yes! You can send images by clicking the attachment button or pasting images. Files are encrypted before upload.'
      },
      {
        question: 'What do message reactions do?',
        answer: 'Reactions let you respond to messages with emojis. They\'re a quick way to acknowledge messages without typing.'
      },
      {
        question: 'How do I know if a message was delivered?',
        answer: 'Messages show a single checkmark when sent and delivered. Read receipts are not implemented to protect privacy.'
      }
    ]
  }

  const filteredCategories = categories.filter(category => {
    const categoryFaqs = faqData[category.id] || []
    return categoryFaqs.some(faq => 
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })

  const currentFaqs = faqData[activeCategory] || []

  const handlePrivacyPolicy = () => {
    // Open privacy policy in new tab
    window.open('/privacy-policy.html', '_blank')
  }

  const handleDocumentation = () => {
    // Open documentation in new tab
    window.open('/docs/SYSTEM_DOCUMENTATION.md', '_blank')
  }

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="bg-[var(--bg-surface)] w-full max-w-4xl max-h-[90vh] rounded-2xl border border-[var(--border-subtle)] shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center">
              <HelpCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[var(--text-main)]">Help & Support</h2>
              <p className="text-[var(--text-secondary)] text-sm">Find answers to common questions</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--bg-element)] rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-6 border-b border-[var(--border-subtle)]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-[var(--text-muted]" />
            <input
              type="text"
              placeholder="Search for help..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-[var(--bg-element)] text-[var(--text-main)] rounded-xl border border-[var(--border-subtle)] focus:border-[var(--theme-base)] focus:outline-none transition-colors"
            />
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Categories Sidebar */}
          <div className="w-64 bg-[var(--bg-element)] border-r border-[var(--border-subtle)] overflow-y-auto">
            <div className="p-4">
              <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Categories</h3>
              <div className="space-y-1">
                {(searchQuery ? filteredCategories : categories).map(category => (
                  <button
                    key={category.id}
                    onClick={() => setActiveCategory(category.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                      activeCategory === category.id
                        ? 'bg-[var(--theme-base)] text-white'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]'
                    }`}
                  >
                    <span className={activeCategory === category.id ? 'text-white' : category.color}>
                      {category.icon}
                    </span>
                    <span className="text-sm font-medium">{category.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* FAQ Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-3xl mx-auto">
              <h3 className="text-lg font-semibold text-[var(--text-main)] mb-4">
                {categories.find(c => c.id === activeCategory)?.name}
              </h3>
              
              <div className="space-y-4">
                {currentFaqs.map((faq, index) => (
                  <div key={index} className="border border-[var(--border-subtle)] rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedFaq(expandedFaq === index ? null : index)}
                      className="w-full px-4 py-3 text-left flex items-center justify-between hover:bg-[var(--bg-element)] transition-colors"
                    >
                      <span className="text-[var(--text-main)] font-medium">{faq.question}</span>
                      <ChevronRight 
                        className={`w-5 h-5 text-[var(--text-muted)] transition-transform ${
                          expandedFaq === index ? 'rotate-90' : ''
                        }`}
                      />
                    </button>
                    {expandedFaq === index && (
                      <div className="px-4 py-3 bg-[var(--bg-element)] border-t border-[var(--border-subtle)]">
                        <p className="text-[var(--text-secondary)] leading-relaxed">{faq.answer}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[var(--border-subtle)] bg-[var(--bg-element)]">
          <div className="flex items-center justify-between">
            <div className="text-sm text-[var(--text-muted)]">
              <p>View our documentation for more information.</p>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={handlePrivacyPolicy}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-surface)] hover:bg-[var(--bg-element)] text-[var(--text-main)] rounded-lg transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Privacy Policy
              </button>
              <button 
                onClick={handleDocumentation}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white rounded-lg transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                View Documentation
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
