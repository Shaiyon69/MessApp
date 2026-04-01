import { useState } from 'react'
import { ChevronRight, Shield, Lock, MessageSquare, Smartphone, Check } from 'lucide-react'

export default function Onboarding({ onComplete }) {
  const [currentStep, setCurrentStep] = useState(0)
  const [isCompleting, setIsCompleting] = useState(false)

  const steps = [
    {
      icon: <MessageSquare className="w-12 h-12" />,
      title: "Welcome to MessApp",
      description: "A secure messaging app with end-to-end encryption for your privacy.",
      features: [
        "Real-time messaging",
        "End-to-end encryption", 
        "Cross-platform support"
      ]
    },
    {
      icon: <Lock className="w-12 h-12" />,
      title: "Privacy First",
      description: "Your messages are encrypted with military-grade security.",
      features: [
        "AES-GCM-256 encryption",
        "ECDH key exchange",
        "PIN-protected backups"
      ]
    },
    {
      icon: <Shield className="w-12 h-12" />,
      title: "Secure by Design",
      description: "We can't read your messages. Only you and your recipients can.",
      features: [
        "Zero-access encryption",
        "No tracking or ads",
        "Open source cryptography"
      ]
    },
    {
      icon: <Smartphone className="w-12 h-12" />,
      title: "Get Started",
      description: "Create an account or sign in to start messaging securely.",
      features: [
        "Email authentication",
        "Optional PIN backup",
        "Sync across devices"
      ]
    }
  ]

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      handleComplete()
    }
  }

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleComplete = async () => {
    setIsCompleting(true)
    // Mark onboarding as complete
    localStorage.setItem('messapp_onboarding_complete', 'true')
    await new Promise(resolve => setTimeout(resolve, 500))
    onComplete()
  }

  const handleSkip = () => {
    localStorage.setItem('messapp_onboarding_complete', 'true')
    onComplete()
  }

  const currentStepData = steps[currentStep]
  const progress = ((currentStep + 1) / steps.length) * 100

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#121417] via-[#1a1c24] to-[#121417] flex flex-col items-center justify-center p-4 md:p-8">
      {/* Progress Bar */}
      <div className="w-full max-w-md mb-8">
        <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-400">
          <span>Step {currentStep + 1} of {steps.length}</span>
          <span>{Math.round(progress)}% Complete</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="w-full max-w-md bg-[#1a1c24] rounded-3xl border border-gray-700 shadow-2xl p-8 md:p-10">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-2xl flex items-center justify-center text-white shadow-lg">
            {currentStepData.icon}
          </div>
        </div>

        {/* Title and Description */}
        <div className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
            {currentStepData.title}
          </h2>
          <p className="text-gray-300 text-lg leading-relaxed">
            {currentStepData.description}
          </p>
        </div>

        {/* Features */}
        <div className="space-y-3 mb-8">
          {currentStepData.features.map((feature, index) => (
            <div key={index} className="flex items-center gap-3 text-gray-200">
              <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
              <span className="text-sm">{feature}</span>
            </div>
          ))}
        </div>

        {/* Navigation */}
        <div className="space-y-4">
          <div className="flex gap-3">
            {currentStep > 0 && (
              <button
                onClick={handlePrevious}
                className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors"
              >
                Previous
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={isCompleting}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white rounded-xl font-medium transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isCompleting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Setting up...
                </>
              ) : (
                <>
                  {currentStep === steps.length - 1 ? 'Get Started' : 'Next'}
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          {/* Skip Button */}
          <button
            onClick={handleSkip}
            className="w-full px-6 py-2 text-gray-400 hover:text-gray-300 text-sm transition-colors"
          >
            Skip onboarding
          </button>
        </div>

        {/* Privacy Note */}
        {currentStep === steps.length - 1 && (
          <div className="mt-6 p-4 bg-gray-800 rounded-xl text-xs text-gray-400 text-center">
            By continuing, you agree to our Privacy Policy and Terms of Service.
            Your messages are end-to-end encrypted and private.
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-gray-500 text-sm">
        <p>Secure messaging for everyone</p>
        <p className="mt-1">Version 1.0.0</p>
      </div>
    </div>
  )
}
