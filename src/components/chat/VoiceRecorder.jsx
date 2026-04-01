import React, { useState, useRef, useEffect } from 'react'
import { Mic, MicOff, Pause, Play, Square, Trash2, Volume2, VolumeX } from 'lucide-react'

export default function VoiceRecorder({ 
  onSendVoiceNote, 
  channelId, 
  dmRoomId,
  maxSize = 60 // max recording time in seconds
}) {
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioUrl, setAudioUrl] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackTime, setPlaybackTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  
  const audioRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const streamRef = useRef(null)
  const timerRef = useRef(null)
  const playbackTimerRef = useRef(null)

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      })
      
      streamRef.current = stream
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      })
      
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }
      
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { 
          type: 'audio/webm;codecs=opus' 
        })
        
        const url = URL.createObjectURL(audioBlob)
        setAudioUrl(url)
        
        // Load audio for playback
        if (audioRef.current) {
          audioRef.current.src = url
          audioRef.current.load()
        }
      }
      
      mediaRecorder.start(100)
      setIsRecording(true)
      setIsPaused(false)
      setRecordingTime(0)
      
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= maxSize) {
            stopRecording()
            return prev
          }
          return prev + 1
        })
      }, 1000)
      
    } catch (error) {
      console.error('Failed to start recording:', error)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop()
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    
    setIsRecording(false)
    setIsPaused(false)
  }

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause()
      setIsPaused(true)
      
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }

  const resumeRecording = () => {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      mediaRecorderRef.current.resume()
      setIsPaused(false)
      
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
    }
  }

  const cancelRecording = () => {
    stopRecording()
    setAudioUrl(null)
    setRecordingTime(0)
    audioChunksRef.current = []
  }

  const playPause = () => {
    if (!audioRef.current) return

    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
      
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current)
      }
    } else {
      audioRef.current.play()
      setIsPlaying(true)
      
      playbackTimerRef.current = setInterval(() => {
        if (audioRef.current) {
          setPlaybackTime(audioRef.current.currentTime)
        }
      }, 100)
    }
  }

  const sendVoiceNote = async () => {
    if (!audioUrl) return

    const audioBlob = new Blob(audioChunksRef.current, { 
      type: 'audio/webm;codecs=opus' 
    })

    try {
      await onSendVoiceNote(audioBlob, recordingTime, channelId, dmRoomId)
      cancelRecording()
    } catch (error) {
      console.error('Failed to send voice note:', error)
    }
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value)
    setVolume(newVolume)
    if (audioRef.current) {
      audioRef.current.volume = newVolume
    }
  }

  const toggleMute = () => {
    const newMuted = !isMuted
    setIsMuted(newMuted)
    if (audioRef.current) {
      audioRef.current.muted = newMuted
    }
  }

  const handleSeek = (e) => {
    const newTime = parseFloat(e.target.value)
    setPlaybackTime(newTime)
    if (audioRef.current) {
      audioRef.current.currentTime = newTime
    }
  }

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleLoadedMetadata = () => {
      setDuration(audio.duration)
    }

    const handleEnded = () => {
      setIsPlaying(false)
      setPlaybackTime(0)
      
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current)
      }
    }

    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('ended', handleEnded)

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('ended', handleEnded)
      
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
      
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current)
      }
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isRecording) {
        cancelRecording()
      }
      
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl)
      }
    }
  }, [isRecording, audioUrl])

  if (!isRecording && !audioUrl) {
    return (
      <button
        onClick={startRecording}
        className="p-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-full transition-colors cursor-pointer"
        title="Record voice note"
      >
        <Mic size={20} />
      </button>
    )
  }

  if (isRecording) {
    const progress = (recordingTime / maxSize) * 100
    const isNearLimit = recordingTime >= maxSize - 10

    return (
      <div className="flex items-center gap-3 p-3 bg-[var(--bg-element)] rounded-xl border border-red-500/30">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${isPaused ? 'bg-yellow-400' : 'bg-red-500 animate-pulse'}`} />
          <span className={`text-sm font-medium ${isNearLimit ? 'text-red-400' : 'text-[var(--text-main)]'}`}>
            {formatTime(recordingTime)}
          </span>
        </div>

        <div className="flex-1">
          <div className="w-full bg-[var(--bg-base)] rounded-full h-2">
            <div 
              className={`h-2 rounded-full transition-all ${
                isNearLimit ? 'bg-red-500' : 'bg-indigo-500'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-1">
          {isPaused ? (
            <button
              onClick={resumeRecording}
              className="p-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg transition-colors cursor-pointer"
              title="Resume recording"
            >
              <Play size={16} />
            </button>
          ) : (
            <button
              onClick={pauseRecording}
              className="p-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg transition-colors cursor-pointer"
              title="Pause recording"
            >
              <Pause size={16} />
            </button>
          )}
          
          <button
            onClick={stopRecording}
            className="p-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors cursor-pointer"
            title="Stop recording"
          >
            <Square size={16} />
          </button>
          
          <button
            onClick={cancelRecording}
            className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors cursor-pointer"
            title="Cancel recording"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    )
  }

  if (audioUrl) {
    return (
      <div className="flex items-center gap-3 p-3 bg-[var(--bg-element)] rounded-xl">
        <button
          onClick={playPause}
          className="p-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-colors cursor-pointer"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>

        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-muted]">
              {formatTime(playbackTime)}
            </span>
            <input
              type="range"
              min="0"
              max={duration || 0}
              value={playbackTime}
              onChange={handleSeek}
              className="flex-1 h-1 bg-[var(--bg-base)] rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #6366f1 0%, #6366f1 ${(playbackTime / duration) * 100}%, #374151 ${(playbackTime / duration) * 100}%, #374151 100%)`
              }}
            />
            <span className="text-xs text-[var(--text-muted]">
              {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleMute}
              className="p-1 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={handleVolumeChange}
              className="w-20 h-1 bg-[var(--bg-base)] rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-xs text-[var(--text-muted]">
            {formatTime(recordingTime)}
          </span>
          
          <button
            onClick={sendVoiceNote}
            className="p-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors cursor-pointer"
            title="Send voice note"
          >
            <Mic size={16} />
          </button>
          
          <button
            onClick={cancelRecording}
            className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors cursor-pointer"
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
        </div>

        <audio
          ref={audioRef}
          onLoadedMetadata={() => setDuration(audioRef.current.duration)}
          onTimeUpdate={() => setPlaybackTime(audioRef.current.currentTime)}
          onEnded={() => {
            setIsPlaying(false)
            setPlaybackTime(0)
          }}
        />
      </div>
    )
  }

  return null
}
