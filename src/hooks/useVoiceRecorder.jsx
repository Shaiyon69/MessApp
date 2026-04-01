import { useState, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import toast from 'react-hot-toast'

export function useVoiceRecorder(session) {
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioBlob, setAudioBlob] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const timerRef = useRef(null)
  const streamRef = useRef(null)

  const startRecording = async () => {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      })
      
      streamRef.current = stream
      
      // Create media recorder
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
      
      mediaRecorder.onstop = handleRecordingStop
      
      // Start recording
      mediaRecorder.start(100) // Collect data every 100ms
      setIsRecording(true)
      setIsPaused(false)
      setRecordingTime(0)
      
      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
      
      toast.success('Recording started', { icon: '🎤' })
      
    } catch (error) {
      console.error('Failed to start recording:', error)
      toast.error('Failed to access microphone')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      
      // Stop all tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
      
      // Clear timer
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      
      setIsRecording(false)
      setIsPaused(false)
    }
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
    setAudioBlob(null)
    setAudioUrl(null)
    setRecordingTime(0)
    audioChunksRef.current = []
    
    toast('Recording cancelled', { icon: '❌' })
  }

  const handleRecordingStop = () => {
    const audioBlob = new Blob(audioChunksRef.current, { 
      type: 'audio/webm;codecs=opus' 
    })
    
    setAudioBlob(audioBlob)
    setAudioUrl(URL.createObjectURL(audioBlob))
    
    toast.success('Recording saved', { icon: '✅' })
  }

  const uploadVoiceNote = async (channelId = null, dmRoomId = null) => {
    if (!audioBlob || !session?.user?.id) return null

    setIsUploading(true)
    
    try {
      // Generate unique filename
      const fileName = `voice-note-${session.user.id}-${Date.now()}.webm`
      
      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('voice-notes')
        .upload(fileName, audioBlob, {
          contentType: 'audio/webm'
        })

      if (uploadError) throw uploadError

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('voice-notes')
        .getPublicUrl(fileName)

      // Create voice note record in database
      const { data: voiceNoteData, error: dbError } = await supabase
        .from('voice_notes')
        .insert({
          message_id: crypto.randomUUID(), // Will be updated when message is created
          user_id: session.user.id,
          file_url: publicUrl,
          duration_seconds: recordingTime,
          file_size_bytes: audioBlob.size,
          created_at: new Date().toISOString()
        })
        .select()
        .single()

      if (dbError) throw dbError

      // Create message with voice note
      const { data: messageData, error: messageError } = await supabase
        .from('messages')
        .insert({
          profile_id: session.user.id,
          channel_id: channelId,
          dm_room_id: dmRoomId,
          content: '🎤 Voice note',
          voice_note_id: voiceNoteData.id,
          created_at: new Date().toISOString()
        })
        .select()
        .single()

      if (messageError) throw messageError

      // Update voice note with message_id
      await supabase
        .from('voice_notes')
        .update({ message_id: messageData.id })
        .eq('id', voiceNoteData.id)

      toast.success('Voice note sent!', { icon: '🎤' })
      
      // Reset recording state
      setAudioBlob(null)
      setAudioUrl(null)
      setRecordingTime(0)
      
      return messageData
      
    } catch (error) {
      console.error('Failed to upload voice note:', error)
      toast.error('Failed to send voice note')
      return null
    } finally {
      setIsUploading(false)
    }
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Cleanup on unmount
  const cleanup = useCallback(() => {
    if (isRecording) {
      cancelRecording()
    }
    
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
    }
  }, [isRecording, audioUrl])

  return {
    isRecording,
    isPaused,
    recordingTime,
    audioBlob,
    audioUrl,
    isUploading,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    cancelRecording,
    uploadVoiceNote,
    formatTime,
    cleanup
  }
}

export function useVoicePlayer() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  
  const audioRef = useRef(null)
  const intervalRef = useRef(null)

  const loadAudio = (url) => {
    if (audioRef.current) {
      audioRef.current.src = url
      audioRef.current.load()
    }
  }

  const play = () => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed
      audioRef.current.play()
      setIsPlaying(true)
      
      // Start progress tracking
      intervalRef.current = setInterval(() => {
        if (audioRef.current) {
          setCurrentTime(audioRef.current.currentTime)
        }
      }, 100)
    }
  }

  const pause = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      setIsPlaying(false)
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setIsPlaying(false)
      setCurrentTime(0)
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }

  const setSpeed = (speed) => {
    setPlaybackSpeed(speed)
    if (audioRef.current) {
      audioRef.current.playbackRate = speed
    }
  }

  const seek = (time) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time
      setCurrentTime(time)
    }
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Audio event handlers
  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration)
    }
  }

  const handleEnded = () => {
    setIsPlaying(false)
    setCurrentTime(0)
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
  }

  const cleanup = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
    pause()
  }

  return {
    isPlaying,
    currentTime,
    duration,
    playbackSpeed,
    audioRef,
    loadAudio,
    play,
    pause,
    stop,
    setSpeed,
    seek,
    formatTime,
    handleLoadedMetadata,
    handleEnded,
    cleanup
  }
}
