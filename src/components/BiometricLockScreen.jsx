import { useState } from 'react'
import { Lock, Fingerprint, Eye, EyeOff, Shield, AlertCircle } from 'lucide-react'

export default function BiometricLockScreen({ onUnlock, onCancel }) {
  const [authenticating, setAuthenticating] = useState(false)
  const [error, setError] = useState('')
  const [showFallback, setShowFallback] = useState(false)
  const [pin, setPin] = useState('')
  const [showPin, setShowPin] = useState(false)

  const handleBiometricAuth = async () => {
    setAuthenticating(true)
    setError('')
    
    try {
      // Import dynamically to avoid circular dependencies
      const { authenticateBiometric } = await import('../lib/biometricLock')
      const success = await authenticateBiometric('Unlock MessApp')
      
      if (success) {
        onUnlock()
      } else {
        setError('Authentication failed. Try again or use PIN.')
        setShowFallback(true)
      }
    } catch (_err) {
      setError('Biometric authentication not available')
      setShowFallback(true)
    } finally {
      setAuthenticating(false)
    }
  }

  const handlePinAuth = () => {
    if (pin.length === 6) {
      setAuthenticating(true)
      setError('')
      
      // Simple PIN validation (in real app, this would be secure)
      setTimeout(() => {
        if (pin === '123456') { // Default PIN for demo
          onUnlock()
        } else {
          setError('Incorrect PIN')
          setPin('')
        }
        setAuthenticating(false)
      }, 1000)
    }
  }

  const handlePinChange = (value) => {
    if (/^\d{0,6}$/.test(value)) {
      setPin(value)
      setError('')
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handlePinAuth()
    }
  }

  return (
    <div className="fixed inset-0 z-[700] flex items-center justify-center bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-900 p-4">
      <div className="w-full max-w-sm">
        {/* Lock Icon */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center mx-auto mb-4 border border-white/20">
            <Lock className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">MessApp Locked</h1>
          <p className="text-white/70 text-sm">Authenticate to continue</p>
        </div>

        {/* Biometric Authentication */}
        {!showFallback && (
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20">
            <button
              onClick={handleBiometricAuth}
              disabled={authenticating}
              className="w-full flex flex-col items-center gap-4 p-6 bg-white/5 hover:bg-white/10 rounded-xl transition-colors disabled:opacity-50"
            >
              {authenticating ? (
                <div className="w-12 h-12 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <Fingerprint className="w-12 h-12 text-white" />
              )}
              <span className="text-white font-medium">
                {authenticating ? 'Authenticating...' : 'Use Biometric'}
              </span>
            </button>
            
            <button
              onClick={() => setShowFallback(true)}
              className="w-full mt-4 text-white/70 hover:text-white text-sm transition-colors"
            >
              Use PIN instead
            </button>
          </div>
        )}

        {/* PIN Authentication */}
        {showFallback && (
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20">
            <div className="flex items-center justify-center mb-6">
              <Shield className="w-8 h-8 text-white/70 mr-2" />
              <span className="text-white font-medium">Enter PIN</span>
            </div>

            {/* PIN Input */}
            <div className="mb-4">
              <div className="flex items-center gap-2 bg-white/5 rounded-xl px-4 py-3 border border-white/10">
                <input
                  type={showPin ? 'text' : 'password'}
                  value={pin}
                  onChange={(e) => handlePinChange(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Enter 6-digit PIN"
                  className="flex-1 bg-transparent text-white placeholder-white/50 outline-none text-center text-xl tracking-widest"
                  maxLength={6}
                  autoFocus
                />
                <button
                  onClick={() => setShowPin(!showPin)}
                  className="text-white/70 hover:text-white transition-colors"
                >
                  {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* PIN Dots */}
            <div className="flex justify-center gap-2 mb-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full transition-colors ${
                    i <= pin.length ? 'bg-white' : 'bg-white/30'
                  }`}
                />
              ))}
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/20 rounded-lg mb-4">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-red-400 text-sm">{error}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handlePinAuth}
                disabled={pin.length !== 6 || authenticating}
                className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {authenticating ? 'Unlocking...' : 'Unlock'}
              </button>
              
              <button
                onClick={onCancel}
                className="px-4 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-medium transition-colors"
              >
                Cancel
              </button>
            </div>

            <button
              onClick={() => {
                setShowFallback(false)
                setPin('')
                setError('')
              }}
              className="w-full mt-4 text-white/70 hover:text-white text-sm transition-colors"
            >
              Back to Biometric
            </button>
          </div>
        )}

        {/* Security Notice */}
        <div className="text-center mt-8">
          <p className="text-white/50 text-xs">
            Your messages are protected with end-to-end encryption
          </p>
        </div>
      </div>
    </div>
  )
}
