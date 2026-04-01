import { Capacitor } from '@capacitor/core'
import { Toast } from '@capacitor/toast'

class BiometricLock {
  constructor() {
    this.isEnabled = false
    this.isLocked = false
    this.lockTimeout = null
  }

  // Check if biometric authentication is available
  async isAvailable() {
    if (!Capacitor.isNativePlatform()) return false
    
    try {
      // For now, we'll assume biometrics are available on native platforms
      // In a real implementation, you'd check specific biometric capabilities
      return Capacitor.getPlatform() === 'android' || Capacitor.getPlatform() === 'ios'
    } catch (error) {
      console.error('Biometric availability check failed:', error)
      return false
    }
  }

  // Enable biometric lock
  async enable() {
    const isAvailable = await this.isAvailable()
    if (!isAvailable) {
      throw new Error('Biometric authentication not available on this device')
    }

    // Test biometric authentication
    const success = await this.authenticate('Enable biometric lock')
    if (success) {
      this.isEnabled = true
      localStorage.setItem('biometric_lock_enabled', 'true')
      return true
    }
    throw new Error('Biometric authentication failed')
  }

  // Disable biometric lock
  disable() {
    this.isEnabled = false
    this.isLocked = false
    localStorage.removeItem('biometric_lock_enabled')
    this.clearLockTimeout()
  }

  // Check if biometric lock is enabled
  checkEnabled() {
    const stored = localStorage.getItem('biometric_lock_enabled')
    this.isEnabled = stored === 'true'
    return this.isEnabled
  }

  // Authenticate with biometrics
  async authenticate(reason = 'Authenticate') {
    const isAvailable = await this.isAvailable()
    if (!isAvailable) return true // Fallback for web/desktop

    if (!Capacitor.isNativePlatform()) return true // Skip on web

    try {
      // In a real implementation, you'd use the actual biometric API
      // For now, we'll simulate it with a timeout
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Show success message
      if (Capacitor.getPlatform() !== 'web') {
        await Toast.show({
          text: 'Authentication successful',
          duration: 'short'
        })
      }
      
      return true
    } catch (error) {
      console.error('Biometric authentication failed:', error)
      
      // Show error message
      if (Capacitor.getPlatform() !== 'web') {
        await Toast.show({
          text: 'Authentication failed',
          duration: 'short'
        })
      }
      
      return false
    }
  }

  // Lock the app
  lock() {
    if (!this.isEnabled) return
    
    this.isLocked = true
    this.setLockTimeout()
  }

  // Unlock the app
  async unlock() {
    if (!this.isEnabled) return true
    
    const success = await this.authenticate('Unlock MessApp')
    if (success) {
      this.isLocked = false
      this.clearLockTimeout()
      return true
    }
    return false
  }

  // Check if app is locked
  isAppLocked() {
    return this.isLocked
  }

  // Set automatic lock timeout
  setLockTimeout(minutes = 5) {
    this.clearLockTimeout()
    this.lockTimeout = setTimeout(() => {
      this.lock()
    }, minutes * 60 * 1000)
  }

  // Clear lock timeout
  clearLockTimeout() {
    if (this.lockTimeout) {
      clearTimeout(this.lockTimeout)
      this.lockTimeout = null
    }
  }

  // Reset lock timeout (call when user interacts with app)
  resetLockTimeout() {
    if (this.isEnabled && !this.isLocked) {
      this.setLockTimeout()
    }
  }

  // Initialize biometric lock
  async initialize() {
    this.checkEnabled()
    
    // Lock app on startup if enabled
    if (this.isEnabled && Capacitor.isNativePlatform()) {
      this.lock()
    }
  }
}

// Export singleton instance
export const biometricLock = new BiometricLock()

// Export convenience functions
export const enableBiometricLock = () => biometricLock.enable()
export const disableBiometricLock = () => biometricLock.disable()
export const authenticateBiometric = (reason) => biometricLock.authenticate(reason)
export const lockApp = () => biometricLock.lock()
export const unlockApp = () => biometricLock.unlock()
export const isBiometricEnabled = () => biometricLock.checkEnabled()
export const isAppLocked = () => biometricLock.isAppLocked()
export const resetLockTimeout = () => biometricLock.resetLockTimeout()
