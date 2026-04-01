import { useState, useEffect } from 'react'

export function usePWA() {
  const [isPWA, setIsPWA] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [installPrompt, setInstallPrompt] = useState(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    // Check if running as PWA
    const checkPWA = () => {
      setIsPWA(
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true ||
        document.referrer.includes('android-app://')
      )
    }

    checkPWA()
    window.addEventListener('resize', checkPWA)

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault()
      setInstallPrompt(e)
    }

    // Listen for app install
    const handleAppInstalled = () => {
      setIsInstalled(true)
      setInstallPrompt(null)
    }

    // Listen for online/offline status
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('resize', checkPWA)
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const installApp = async () => {
    if (!installPrompt) return false

    try {
      const result = await installPrompt.prompt()
      const outcome = await result.userChoice
      
      if (outcome === 'accepted') {
        setInstallPrompt(null)
        return true
      }
      return false
    } catch (error) {
      console.error('PWA install failed:', error)
      return false
    }
  }

  const showInstallPrompt = () => {
    return !!installPrompt && !isInstalled && !isPWA
  }

  const canShare = () => {
    return navigator.share !== undefined
  }

  const shareContent = async (title, text, url) => {
    if (!navigator.share) return false

    try {
      await navigator.share({ title, text, url })
      return true
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Share failed:', error)
      }
      return false
    }
  }

  const addToHomeScreen = () => {
    // For iOS Safari
    if ('standalone' in window.navigator && window.navigator.standalone) {
      return true
    }

    // For Chrome/Edge
    if (installPrompt) {
      return installApp()
    }

    return false
  }

  return {
    isPWA,
    isInstalled,
    isOnline,
    installPrompt,
    installApp,
    showInstallPrompt,
    canShare,
    shareContent,
    addToHomeScreen
  }
}
