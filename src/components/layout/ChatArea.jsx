/**
 * Owns central chat presentation and composer-only UI state. Dashboard and the
 * chat hook supply data/actions. Mobile trays and viewport offsets stay aligned
 * with native keyboard and safe-area behavior.
 */
import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback, lazy, Suspense } from 'react'
import toast from 'react-hot-toast'
import { ORIGIN_FILTERS, messageOrigin, stepOriginFilter } from '../../lib/messageOrigin'
import { Loader2, WifiOff, Hash, Phone, Video, Info, MessageSquare, ImagePlus, Paperclip, Send, X, Trash2, SmilePlus, Plus, FileText, ChevronLeft, ChevronDown, Mic, MicOff, MonitorUp, PhoneOff, Radio, Volume2, VolumeX, Eye, EyeOff, SlidersHorizontal, Camera, Square, Timer, Check, Film, Lock, BarChart3, PanelLeftClose, Users } from 'lucide-react'
import StatusAvatar from '../ui/StatusAvatar'
import { MemoizedMessage } from '../chat/MessageElements'
import VoiceMessagePlayer from '../chat/VoiceMessagePlayer'
import AddFriendView from '../modals/AddFriendView'
import BottomBar, { TABS } from './BottomBar'
import ChatsPage from './ChatsPage'
import MenuPage from './MenuPage'
import NotificationsPage from './NotificationsPage'
import QuickActionsFab from './QuickActionsFab'
import ServersPage from './ServersPage'
import { debug } from '../../lib/debug'
import { openDmEntry } from '../../lib/chatActions'
import useLongPress from '../../hooks/useLongPress'
import { DISAPPEARING_OPTIONS, describeExpiry } from '../../lib/messageExpiry'
import { SEND_RADIAL_OPTIONS, SEND_RADIAL_PX, SEND_RADIAL_CYCLE_MS, pickSendRadial, pickVoiceHold, radialDuration } from '../../lib/sendRadial'
import { blurComposer, resizeComposer, enterSends } from '../../lib/composerFocus'
import { applyMention, findMentionQuery, matchMembers, normalizeMention } from '../../lib/mentions'
import { applyWordEffect, stripEffects } from '../../lib/messageEffects'
import ScreenEffect from '../chat/ScreenEffect'
import { PollComposer } from '../chat/Poll'
import { getPendingFileFingerprint } from '../../hooks/useChatManager'
import { primeVideoPreview } from '../../lib/videoPreview'
import {
  formatVoiceMessageDuration,
  getVoiceMessageExtension,
  getVoiceMessageMimeType,
  normalizeVoiceMessageMimeType
} from '../../lib/voiceMessages'
import { getVoiceMediaStream, VOICE_MESSAGE_BITRATE } from '../../lib/voiceAudioProcessing'
import { createDraftStore } from '../../lib/drafts'
import useStoredState from '../../hooks/useStoredState'
import { clampListWidth, LIST_WIDTH_DEFAULT } from '../../lib/listWidth'
import { firstUnreadIndex, countUnreadFrom } from '../../lib/unreadAnchor'
import { stepRowIndex } from '../../lib/conversationNav'

// Kept out of the boot bundle — each is only mounted behind a user action
// (opening a picker, editing media, joining a voice channel).
const GifPickerPopout = lazy(() => import('../modals/GifPickerPopout'))
const ComposerDrawer = lazy(() => import('../chat/ComposerDrawer'))
const ThreadPanel = lazy(() => import('../chat/ThreadPanel'))
const SfuScreenShare = lazy(() => import('../screen-share/SfuScreenShare'))
const MediaEditorModal = lazy(() => import('../media/MediaEditorModal'))

const MODERATOR_ROLES = ['owner', 'admin', 'moderator']

const debugStack = () => new Error().stack?.split('\n').slice(2, 8).join('\n')

const logMenuDebug = (event, payload = {}) => {
  console.debug('[MENU_DEBUG]', event, {
    componentPath: 'src/components/layout/ChatArea.jsx',
    ...payload,
    stack: debugStack()
  })
}

export default function ChatArea(props) {
  const [pendingServerAction, setPendingServerAction] = useState(null);
  /* Which pane ServersPage is showing. It lives here, not in ServersPage,
     because the quick-actions FAB is centered inside the docked server bar on
     the detail pane and floats in the corner on the list. activeServer
     survives a back press, so it cannot stand in for this. */
  const [serversPanelView, setServersPanelView] = useState(() => (props.activeServer ? 'detail' : 'list'));
  const [showInputEmojiPicker, setShowInputEmojiPicker] = useState(false);
  const [composerDrawerTab, setComposerDrawerTab] = useState('emoji');
  const drawerPinnedToBottomRef = useRef(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showPollComposer, setShowPollComposer] = useState(false);
  const [openThreadId, setOpenThreadId] = useState(null);
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [pendingPreviewUrls, setPendingPreviewUrls] = useState([]);
  const [voiceControlsOpen, setVoiceControlsOpen] = useState(false);
  const [voiceRecorderState, setVoiceRecorderState] = useState({ status: 'idle', elapsed: 0 });
  const [voiceLevels, setVoiceLevels] = useState(() => Array.from({ length: 28 }, () => 0.08));
  const [mediaEditorTarget, setMediaEditorTarget] = useState(null);
  const [sendOptionsOpen, setSendOptionsOpen] = useState(false);
  const [radialOpen, setRadialOpen] = useState(false);
  // The hold menu has no visible handle; say it exists until it has been used once.
  const [sendHintSeen, setSendHintSeen] = useState(() => { try { return localStorage.getItem('messapp.sendHintSeen') === '1' } catch { return true } });
  const [radialIndex, setRadialIndex] = useState(null);
  /* Ticks up while a timed wedge is held, walking its lifetime through the
     cycle. Reset whenever the thumb moves to another wedge, so a lifetime is
     always chosen by dwelling rather than inherited from the last wedge. */
  const [radialStep, setRadialStep] = useState(0);
  /* The composer is uncontrolled — handleSendMessage reads the DOM value — so
     the send button needs its own signal for whether anything is typed. */
  const [composerHasText, setComposerHasText] = useState(false)
  /* The @token the caret is inside, or null. Read off the DOM in syncComposer
     for the same reason composerHasText is: React never sees the field's text. */
  const [mentionQuery, setMentionQuery] = useState(null)
  const [mentionIndex, setMentionIndex] = useState(0)

  // null while nothing is being held; otherwise what releasing would do.
  const [voiceHold, setVoiceHold] = useState(null);
  
  const emojiPickerRef = useRef(null);
  const gifPickerRef = useRef(null);
  const attachMenuRef = useRef(null);
  const sendOptionsRef = useRef(null);
  const sendPressRef = useRef(null);
  const cameraPhotoInputRef = useRef(null);
  const cameraVideoInputRef = useRef(null);
  const voiceRecorderRef = useRef(null);
  const voiceStartingRef = useRef(false);
  const voiceRecorderStreamRef = useRef(null);
  const voiceRecorderChunksRef = useRef([]);
  const voiceRecorderTimerRef = useRef(null);
  const voiceRecorderCancelledRef = useRef(false);
  const voiceAnalyserRef = useRef(null);
  const voiceAudioContextRef = useRef(null);
  const voiceLevelFrameRef = useRef(null);
  const edgeGestureRef = useRef(null);
  const previousChatKeyRef = useRef('');
  const initialPositionRef = useRef({ chatKey: '', positioned: false });
  const [positionedChatKey, setPositionedChatKey] = useState('');
  const formatPendingFileSize = (bytes) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return ''
    const units = ['B', 'KB', 'MB', 'GB']
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
    return `${(bytes / (1024 ** index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
  }
  const chatViewportStyle = props.isChatActive ? {
    backgroundColor: 'var(--chat-bg-base)',
    backgroundImage: props.wallpaperCSS && props.wallpaperCSS !== 'none' ? props.wallpaperCSS : 'none',
    backgroundSize: props.wallpaperSize || 'cover',
    backgroundRepeat: props.wallpaperRepeat || 'no-repeat',
    backgroundPosition: props.wallpaperPosition || 'center'
  } : undefined;
  const latestOutgoingMessageId = useMemo(() => {
    for (let index = props.visibleMessages.length - 1; index >= 0; index -= 1) {
      const message = props.visibleMessages[index]
      if (message?.profile_id === props.session.user.id) return message.id
    }
    return null
  }, [props.session.user.id, props.visibleMessages])
  const validMessagesById = useMemo(() => new Map(props.validMessages.map(message => [message.id, message])), [props.validMessages])
  const editingMessage = props.editingMessageId ? validMessagesById.get(props.editingMessageId) : null
  const activeChatKey = `${props.view}:${props.activeChannel?.id || props.activeDm?.dm_room_id || 'none'}`
  // A thread belongs to one channel; leaving the channel closes it.
  useEffect(() => { setOpenThreadId(null) }, [activeChatKey])
  const isInitialPositionReady = positionedChatKey === activeChatKey
  const isVoiceChannel = props.view === 'server' && props.activeChannel?.type === 'voice'
  const isActiveVoiceSession = isVoiceChannel && props.activeVoiceSession?.channelId === props.activeChannel?.id
  // Occupancy comes from server-wide presence so an unjoined channel still
  // shows who is already waiting inside it.
  const voiceChannelParticipants = isVoiceChannel
    ? (props.getVoiceParticipantsForChannel?.(props.activeChannel?.id) || [])
    : []
  const messageListStyle = props.isCallMinimized
    ? { paddingBottom: 'calc(9.5rem + env(safe-area-inset-bottom, 0px))' }
    : undefined

  const toggleVoiceDeafened = () => {
    const nextDeafened = !props.voiceDeafened
    props.setVoiceMuted?.(nextDeafened)
    props.setVoiceDeafened?.(nextDeafened)
  }

  const releaseVoiceRecorder = useCallback(() => {
    if (voiceRecorderTimerRef.current) {
      clearInterval(voiceRecorderTimerRef.current)
      voiceRecorderTimerRef.current = null
    }
    voiceRecorderStreamRef.current?.getTracks().forEach(track => track.stop())
    if (voiceLevelFrameRef.current) cancelAnimationFrame(voiceLevelFrameRef.current)
    voiceLevelFrameRef.current = null
    voiceAnalyserRef.current = null
    voiceAudioContextRef.current?.close?.().catch(() => {})
    voiceAudioContextRef.current = null
    voiceRecorderStreamRef.current = null
    voiceRecorderRef.current = null
    setVoiceLevels(Array.from({ length: 28 }, () => 0.08))
  }, [])

  const finishVoiceRecording = useCallback((cancelled = false) => {
    const recorder = voiceRecorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    voiceRecorderCancelledRef.current = cancelled
    setVoiceRecorderState(current => ({ ...current, status: 'stopping' }))
    recorder.stop()
  }, [])

  const startVoiceRecording = async () => {
    /* A touch pointerup is followed by a click, so the hold path and the tap
       path both arrive here for one gesture. The flag has to be a ref set before
       the first await: on the very first recording the permission prompt sits in
       the middle of that await, and both callers would otherwise get past a
       check on the recorder itself and open two microphone streams. */
    if (voiceStartingRef.current || voiceRecorderRef.current) return
    voiceStartingRef.current = true
    setShowAttachMenu(false)
    setShowInputEmojiPicker(false)
    props.setShowGifPicker(false)
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder !== 'function') {
      voiceStartingRef.current = false
      toast.error('Voice recording is not available on this device.')
      return
    }

    try {
      const stream = await getVoiceMediaStream({
        mediaDevices: navigator.mediaDevices,
        video: false,
        noiseReduction: true
      })
      const preferredMimeType = getVoiceMessageMimeType(MediaRecorder)
      const recorder = new MediaRecorder(stream, {
        ...(preferredMimeType && { mimeType: preferredMimeType }),
        audioBitsPerSecond: VOICE_MESSAGE_BITRATE
      })
      const startedAt = Date.now()

      voiceRecorderStreamRef.current = stream
      voiceRecorderRef.current = recorder
      voiceRecorderChunksRef.current = []
      voiceRecorderCancelledRef.current = false

      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      if (AudioContextClass) {
        const audioContext = new AudioContextClass()
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.72
        audioContext.createMediaStreamSource(stream).connect(analyser)
        const samples = new Uint8Array(analyser.fftSize)
        let lastLevelUpdate = 0
        const sampleVoiceLevel = timestamp => {
          analyser.getByteTimeDomainData(samples)
          if (timestamp - lastLevelUpdate > 70) {
            let squareTotal = 0
            for (const sample of samples) {
              const normalized = (sample - 128) / 128
              squareTotal += normalized * normalized
            }
            const level = Math.min(1, Math.max(0.08, Math.sqrt(squareTotal / samples.length) * 4.5))
            setVoiceLevels(previous => [...previous.slice(1), level])
            lastLevelUpdate = timestamp
          }
          voiceLevelFrameRef.current = requestAnimationFrame(sampleVoiceLevel)
        }
        voiceAudioContextRef.current = audioContext
        voiceAnalyserRef.current = analyser
        voiceLevelFrameRef.current = requestAnimationFrame(sampleVoiceLevel)
      }

      recorder.ondataavailable = event => {
        if (event.data?.size) voiceRecorderChunksRef.current.push(event.data)
      }
      recorder.onerror = () => {
        voiceRecorderCancelledRef.current = true
        toast.error('Voice recording stopped unexpectedly.')
        if (recorder.state !== 'inactive') recorder.stop()
        else {
          releaseVoiceRecorder()
          setVoiceRecorderState({ status: 'idle', elapsed: 0 })
        }
      }
      recorder.onstop = () => {
        const cancelled = voiceRecorderCancelledRef.current
        const chunks = voiceRecorderChunksRef.current
        const recordedType = normalizeVoiceMessageMimeType(recorder.mimeType || preferredMimeType)
        voiceRecorderChunksRef.current = []
        releaseVoiceRecorder()
        setVoiceRecorderState({ status: 'idle', elapsed: 0 })
        if (cancelled || !chunks.length) return

        const blob = new Blob(chunks, { type: recordedType })
        if (!blob.size) {
          toast.error('No audio was captured.')
          return
        }
        const extension = getVoiceMessageExtension(recordedType)
        const file = new File([blob], `voice-message-${Date.now()}.${extension}`, {
          type: recordedType,
          lastModified: Date.now()
        })
        props.queuePendingAttachmentFromFile?.(file)
      }

      recorder.start(250)
      voiceStartingRef.current = false
      setVoiceRecorderState({ status: 'recording', elapsed: 0 })
      voiceRecorderTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000)
        setVoiceRecorderState({ status: 'recording', elapsed })
        if (elapsed >= 300 && recorder.state === 'recording') recorder.stop()
      }, 250)
    } catch (error) {
      voiceStartingRef.current = false
      releaseVoiceRecorder()
      const denied = error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError'
      toast.error(denied ? 'Microphone permission is needed to record a voice message.' : 'Could not start voice recording.')
    }
  }

  useEffect(() => () => {
    voiceRecorderCancelledRef.current = true
    const recorder = voiceRecorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    releaseVoiceRecorder()
  }, [activeChatKey, releaseVoiceRecorder])

  useEffect(() => {
    if (!isActiveVoiceSession) setVoiceControlsOpen(false)
  }, [isActiveVoiceSession])

  const hasActiveConversation = Boolean(props.activeDm || props.activeChannel)
  const startEdgeGesture = (event) => {
    if (!hasActiveConversation || event.pointerType !== 'touch' || window.innerWidth >= 768) return
    const edgeWidth = 28
    const side = event.clientX <= edgeWidth
      ? 'left'
      : event.clientX >= window.innerWidth - edgeWidth
        ? 'right'
        : null
    if (!side) return
    edgeGestureRef.current = {
      pointerId: event.pointerId,
      side,
      startX: event.clientX,
      startY: event.clientY
    }
  }

  const finishEdgeGesture = (event) => {
    const gesture = edgeGestureRef.current
    edgeGestureRef.current = null
    if (!gesture || gesture.pointerId !== event.pointerId) return
    const deltaX = event.clientX - gesture.startX
    const deltaY = Math.abs(event.clientY - gesture.startY)
    if (deltaY > 72) return
    if (gesture.side === 'left' && deltaX >= 56) {
      props.handleBack?.()
    } else if (gesture.side === 'right' && deltaX <= -56) {
      if (!(props.showRightSidebar && props.rightTab === 'info')) props.toggleRightSidebar('info')
    }
  }

  useLayoutEffect(() => {
    if (initialPositionRef.current.chatKey !== activeChatKey) {
      initialPositionRef.current = { chatKey: activeChatKey, positioned: false }
      setPositionedChatKey('')
    }

    if (initialPositionRef.current.positioned) return
    const container = props.scrollContainerRef.current
    if (!container) return

    if (props.visibleMessages.length > 0) {
      container.scrollTop = container.scrollHeight
      initialPositionRef.current.positioned = true
      setPositionedChatKey(activeChatKey)
      return
    }

    if (props.initialMessagesLoaded && !props.messagesLoading) {
      initialPositionRef.current.positioned = true
      setPositionedChatKey(activeChatKey)
    }
  }, [activeChatKey, props.initialMessagesLoaded, props.messagesLoading, props.scrollContainerRef, props.visibleMessages.length])

  /* Horizontal swipe pages the DM origin filter. Bubbles keep their own
     swipe-to-reply, so a press that starts on one (or on a control) is ignored. */
  const originSwipeRef = useRef(null)
  const originSwipeEnabled = props.view === 'home' && Boolean(props.activeDm)
  const originSwipe = originSwipeEnabled ? {
    onPointerDown: (event) => {
      originSwipeRef.current = event.target.closest('.message-touch-target, button:not([data-origin-dot]), a, input, textarea, video, audio')
        ? null
        : { x: event.clientX, y: event.clientY, id: event.pointerId }
    },
    onPointerUp: (event) => {
      const start = originSwipeRef.current
      originSwipeRef.current = null
      if (!start || start.id !== event.pointerId) return
      const dx = event.clientX - start.x
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(event.clientY - start.y) * 1.5) return
      props.setOriginFilter(stepOriginFilter(props.originFilter, dx < 0 ? 1 : -1))
    },
    onPointerCancel: () => { originSwipeRef.current = null }
  } : {}
  /* Page indicator for the swipe; the dots stay buttons so mouse and
     keyboard users can still pick a source directly. Floats over the thread
     bottom, so it takes no row of its own. */
  const originDots = originSwipeEnabled && (
    <div className="origin-dots chat-glass premium-menu absolute bottom-full left-1/2 z-20 mb-1 flex -translate-x-1/2 gap-1.5 rounded-full px-1.5 touch-pan-y" role="group" aria-label="Message source" {...originSwipe}>
      {ORIGIN_FILTERS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          aria-pressed={props.originFilter === id}
          data-origin-dot
          aria-label={label}
          title={label}
          onClick={() => props.setOriginFilter(id)}
          className="relative grid h-6 cursor-pointer place-items-center rounded-full px-0.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] before:absolute before:-inset-x-1.5 before:-inset-y-2.5 before:content-['']"
        >
          <span className={`block h-1.5 rounded-full transition-all duration-300 ease-out ${props.originFilter === id ? 'w-5 bg-[var(--theme-base)]' : 'w-1.5 bg-[var(--text-muted)] opacity-50'}`} aria-hidden="true" />
        </button>
      ))}
    </div>
  )

  const closeMessageActionMenu = useCallback((reason, payload = {}) => {
    if (!props.messageActionMenuId) return
    logMenuDebug('menu closed', { reason, messageId: props.messageActionMenuId, ...payload })
    props.setMessageActionMenuId(null)
  }, [props.messageActionMenuId, props.setMessageActionMenuId])

  // Dashboard owns the maintained create_or_get_dm flow; ChatArea only routes
  // validated contacts to that canonical handler.
  const openDmContact = useCallback((entry) => openDmEntry(entry, {
    selectDm: props.selectDm,
    createOrOpenDm: props.createOrOpenDm,
    onMissing: metadata => {
      if (import.meta.env.DEV) debug.warn('DM_LIST', { operation: 'missing-open-handler', ...metadata })
    }
  }), [props.createOrOpenDm, props.selectDm])

  const toggleEmojiPicker = () => {
    blurComposer();
    props.setShowGifPicker(false);
    setShowAttachMenu(false);
    drawerPinnedToBottomRef.current = !props.showLatestMessagesButton;
    setShowInputEmojiPicker(prev => !prev);
  };

  // The drawer takes its height from the thread; keep the newest message in
  // view if the reader was already at the bottom.
  useLayoutEffect(() => {
    const container = props.scrollContainerRef.current
    if (showInputEmojiPicker && drawerPinnedToBottomRef.current && container) container.scrollTop = container.scrollHeight
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInputEmojiPicker])

  const toggleGifPicker = (e) => {
    e.preventDefault();
    e.stopPropagation();
    blurComposer();
    setShowInputEmojiPicker(false);
    setShowAttachMenu(false);
    props.setShowGifPicker(!props.showGifPicker);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowInputEmojiPicker(false)
      }

      if (gifPickerRef.current && !gifPickerRef.current.contains(event.target)) {
        props.setShowGifPicker(false)
      }

      if (attachMenuRef.current && !attachMenuRef.current.contains(event.target)) {
        setShowAttachMenu(false)
      }

      if (sendOptionsRef.current && !sendOptionsRef.current.contains(event.target)) {
        setSendOptionsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handleClickOutside)
    return () => document.removeEventListener('pointerdown', handleClickOutside)
  }, [props.setShowGifPicker])

  useEffect(() => {
    if (previousChatKeyRef.current && previousChatKeyRef.current !== activeChatKey) {
      closeMessageActionMenu('chat_target_changed', {
        from: previousChatKeyRef.current,
        to: activeChatKey
      })
    }
    previousChatKeyRef.current = activeChatKey
  }, [activeChatKey, closeMessageActionMenu])

useEffect(() => {
  if (!props.messageActionMenuId) return

  const selectedEl = document.getElementById(`message-${props.messageActionMenuId}`)

  if (!selectedEl) {
    const frame = requestAnimationFrame(() => {
      const retryEl = document.getElementById(`message-${props.messageActionMenuId}`)
      if (!retryEl) {
        closeMessageActionMenu('message_dom_missing_after_frame')
      }
    })

    return () => cancelAnimationFrame(frame)
  }
}, [props.messageActionMenuId, closeMessageActionMenu])

  useEffect(() => {
    setPinnedMessages(props.pinnedMessages || []);
  }, [props.pinnedMessages]);

  useEffect(() => {
    const urls = (props.pendingFiles || []).map(item => {
      if (item.gifUrl) return item.gifUrl
      return item.file && /^(?:image|video|audio)\//.test(item.file.type || '') ? URL.createObjectURL(item.file) : ''
    })
    setPendingPreviewUrls(urls)
    return () => urls.filter(url => url.startsWith('blob:')).forEach(url => URL.revokeObjectURL(url))
  }, [props.pendingFiles]);

  const openPendingMediaEditor = (item, index) => {
    if (!item?.file || !['image', 'video'].includes(item.type) || item.gifUrl) return
    setMediaEditorTarget({ file: item.file, index, type: item.type })
  }

  const savePendingMediaEdit = async editedFile => {
    const target = mediaEditorTarget
    if (!target) return
    props.setPendingFiles(previous => previous.map((item, index) => index === target.index
      ? {
          ...item,
          file: editedFile,
          type: target.type,
          name: editedFile.name,
          size: editedFile.size,
          fingerprint: getPendingFileFingerprint(editedFile)
        }
      : item))
    setMediaEditorTarget(null)
    toast.success(target.type === 'video' ? 'Video crop ready to send' : 'Image edit ready to send')
  }

  /* Drafts are saved per conversation on every keystroke rather than on the way
     out: the composer lives inside a keyed subtree, so by the time an effect
     cleanup could run for the old conversation the textarea has already been
     replaced and there is nothing left to read. See lib/drafts.js for why DM
     plaintext in localStorage is acceptable here. */
  const userId = props.session.user.id
  const drafts = useMemo(
    () => createDraftStore(typeof localStorage === 'undefined' ? null : localStorage, `drafts_${userId}`),
    [userId]
  )

  // The field is uncontrolled, so every path that changes its value has to say
  // so: React never sees the text and cannot size the box on its own.
  const syncComposer = () => {
    const input = props.messageInputRef.current
    resizeComposer(input)
    const text = input?.value || ''
    if (!props.editingMessageId) {
      drafts.set(activeChatKey, text)
    }
    setComposerHasText(Boolean(text.trim()))
    // Servers only: a DM has one other person in it, so there is nobody to pick.
    const query = props.view === 'server' && !props.editingMessageId
      ? findMentionQuery(text, input?.selectionStart ?? text.length)
      : null
    setMentionQuery(query)
    setMentionIndex(0)
  };

  const mentionCandidates = useMemo(
    () => (mentionQuery ? matchMembers(props.serverMembers, mentionQuery.query) : []),
    [mentionQuery, props.serverMembers]
  )
  const myMention = useMemo(() => normalizeMention(props.myUsername), [props.myUsername])

  const insertMention = (member) => {
    const input = props.messageInputRef.current
    if (!input || !mentionQuery) return
    const caret = input.selectionStart ?? input.value.length
    const next = applyMention(input.value, mentionQuery.start, caret, member?.profiles?.username || '')
    input.value = next.text
    input.setSelectionRange(next.caret, next.caret)
    input.focus()
    syncComposer()
  };

  // A textarea keeps its selection after blur, so the menu tap still knows
  // which words were picked. Picking an effect sends right away; while editing
  // it only rewrites the draft, since the save reads editContent state.
  const sendWithWordEffect = (effect) => {
    const input = props.messageInputRef.current
    if (!input?.value.trim()) return
    const next = applyWordEffect(input.value, input.selectionStart ?? 0, input.selectionEnd ?? 0, effect)
    if (props.editingMessageId) return props.setEditContent(next.text)
    input.value = next.text
    input.form?.requestSubmit()
  };

  // Switching conversations remounts the composer empty; put the draft back.
  useEffect(() => {
    const input = props.messageInputRef.current
    if (!input || props.editingMessageId) return
    input.value = drafts.get(activeChatKey)
    resizeComposer(input)
    setComposerHasText(Boolean(input.value.trim()))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatKey])

  // A forward lands as a quote in the destination's composer, once that
  // conversation is the open one; the draft effect above has already run.
  useEffect(() => {
    const input = props.messageInputRef.current
    if (!input || !props.pendingForward || props.pendingForward.chatKey !== activeChatKey) return
    const quote = props.pendingForward.text.split('\n').map(line => `> ${line}`).join('\n')
    input.value = input.value ? `${input.value}\n${quote}\n` : `${quote}\n`
    props.clearPendingForward?.()
    syncComposer()
    input.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatKey, props.pendingForward])

  // Edit mode loads text into the field without an input event of its own.
  useEffect(() => {
    resizeComposer(props.messageInputRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.editingMessageId, props.editContent])

  // No text and nothing queued: the send button is where voice lives now.
  const sendIsVoice = !composerHasText
    && !props.pendingFiles?.length
    && !props.editingMessageId
    && voiceRecorderState.status === 'idle';

  /* Hold the send button and a radial of send combinations opens around it: drag
     onto a wedge and release to send with it, all in one gesture. Releasing
     without picking a wedge just closes it. */
  const bindSendOptions = useLongPress(() => {
    blurComposer();
    const press = sendPressRef.current;
    // Right-click has nothing to drag: go straight to the menu, and on the mic
    // there is no menu to go to — a click will record instead.
    if (!press) { if (!sendIsVoice) setSendOptionsOpen(true); return; }
    press.held = true;
    if (press.voice) {
      /* Recording starts on the hold rather than on pointerdown so a plain tap
         stays a tap: the tap path records hands-free, which is the only way in
         for anyone who cannot sustain a press. */
      setVoiceHold('hold');
      startVoiceRecording();
      press.element?.setPointerCapture?.(press.pointerId);
      return;
    }
    setSendOptionsOpen(false);
    setRadialOpen(true);
    /* Capture once the hold has opened the radial. The drag leaves the 44px
       button almost immediately, and without capture the moves and the pointerup
       land on whatever sits above the composer. Capturing earlier would break the
       ordinary tap: a captured pointer retargets its click to this wrapper, so
       the submit button never sees it and nothing sends. */
    press.element?.setPointerCapture?.(press.pointerId);
  }, { mouse: true });

  /* The three states the voice gesture can be in. A released hold is a locked
     take, and so is the tap-to-record path — both leave voiceHold null while
     the recorder runs on without a thumb. */
  const voiceStage = voiceHold === 'cancel' ? 'cancel'
    : voiceHold === 'hold' ? 'hold'
      : 'lock';

  const sendOptionHandlers = bindSendOptions();
  const radialHit = (press, event) => (press?.held
    ? pickSendRadial(event.clientX - press.x, press.y - event.clientY)
    : null);

  const endSendPress = () => {
    sendPressRef.current = null;
    setRadialOpen(false);
    setRadialIndex(null);
    setRadialStep(0);
    setVoiceHold(null);
  };

  const radialChoice = SEND_RADIAL_OPTIONS[radialIndex];
  useEffect(() => {
    if (sendHintSeen || !(sendOptionsOpen || radialOpen)) return;
    setSendHintSeen(true);
    try { localStorage.setItem('messapp.sendHintSeen', '1') } catch { /* private mode: hint just shows again */ }
  }, [radialOpen, sendHintSeen, sendOptionsOpen]);

  /* Resting on a timed wedge walks it through the lifetimes rather than adding
     more wedges to aim at: three targets stay reachable by thumb, and the one
     under it keeps offering the next choice for as long as it is held. */
  useEffect(() => {
    if (!radialChoice?.timed) return;
    const timer = setInterval(() => {
      navigator.vibrate?.(15);
      setRadialStep(step => step + 1);
    }, SEND_RADIAL_CYCLE_MS);
    return () => clearInterval(timer);
  }, [radialChoice]);

  const sendGesture = {
    ...sendOptionHandlers,
    onPointerDown: (event) => {
      const tracked = (event.pointerType === 'touch' || event.pointerType === 'pen' || event.button === 0)
        && !event.target?.closest?.('[data-no-long-press]');
      sendPressRef.current = tracked
        ? { x: event.clientX, y: event.clientY, held: false, voice: sendIsVoice, hint: null, index: null, pointerId: event.pointerId, element: event.currentTarget }
        : null;
      sendOptionHandlers.onPointerDown(event);
    },
    onPointerMove: (event) => {
      sendOptionHandlers.onPointerMove(event);
      const press = sendPressRef.current;
      if (!press?.held) return;
      const dy = press.y - event.clientY;
      if (press.voice) {
        const hint = pickVoiceHold(event.clientX - press.x, dy);
        if (hint !== press.hint) {
          navigator.vibrate?.(30);
          press.hint = hint;
          setVoiceHold(hint || 'hold');
        }
        return;
      }
      const index = radialHit(press, event);
      if (index === press.index) return;
      if (index !== null) navigator.vibrate?.(30);
      press.index = index;
      setRadialIndex(index);
      setRadialStep(0);
    },
    onPointerUp: (event) => {
      const press = sendPressRef.current;
      if (press?.voice && press.held) {
        const hint = press.hint;
        sendOptionHandlers.onPointerUp(event);
        endSendPress();
        if (hint === 'cancel') finishVoiceRecording(true);
        /* 'lock' leaves it running for the bar's stop button. So does a release
           that arrives before the recorder is up: the very first hold sits
           behind the microphone permission prompt, and stopping a recorder that
           never started would just swallow the gesture. */
        else if (!hint && voiceRecorderRef.current?.state === 'recording') finishVoiceRecording(false);
        return;
      }
      const choice = SEND_RADIAL_OPTIONS[radialHit(press, event)];
      sendOptionHandlers.onPointerUp(event);
      endSendPress();
      if (!choice) return;
      props.handleSendMessage(null, {
        forceSpoiler: choice.spoiler,
        forceExpirySeconds: radialDuration(choice, radialStep)?.seconds ?? null
      });
      syncComposer();
    },
    onPointerCancel: (event) => { endSendPress(); sendOptionHandlers.onPointerCancel(event); }
  };

  const handleEmojiSelect = (emojiData) => {
    const input = props.messageInputRef.current;
    if (input) {
      const start = input.selectionStart;
      const end = input.selectionEnd;
      input.setRangeText(emojiData.emoji, start, end, 'end');
      const newPos = start + emojiData.emoji.length;
      input.selectionStart = input.selectionEnd = newPos;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      // On touch, focus would raise the keyboard and close the drawer mid-pick.
      if (enterSends()) input.focus();
    }
  };

  /* The click is deferred a tick: the tray unmounts on selection, and a
     synchronous .click() on a node inside a subtree React is tearing down gets
     dropped. The GIF entry runs inline instead — it needs the live event. */
  const openFilePicker = (ref) => setTimeout(() => ref.current?.click(), 0)

  const attachOptions = [
    { id: 'media', label: 'Media', Icon: ImagePlus, open: () => openFilePicker(props.fileInputRef) },
    { id: 'photo', label: 'Photo', Icon: Camera, open: () => openFilePicker(cameraPhotoInputRef) },
    { id: 'video', label: 'Video', Icon: Video, open: () => openFilePicker(cameraVideoInputRef) },
    { id: 'file', label: 'File', Icon: Paperclip, open: () => openFilePicker(props.genericFileInputRef) },
    { id: 'gif', label: 'GIF', Icon: Film, open: (event) => toggleGifPicker(event) },
    // Server channels only: a DM poll would store its options in plaintext.
    ...(props.view === 'server' ? [{ id: 'poll', label: 'Poll', Icon: BarChart3, open: () => setShowPollComposer(true) }] : [])
  ]

  const quickActions = {
    onSearch: () => props.setShowQuickSwitcher(true),
    onAddFriend: () => props.setHomeTab('add'),
    onCreateServer: () => { props.setHomeTab('servers'); setPendingServerAction('create') },
    onJoinServer: () => { props.setHomeTab('servers'); setPendingServerAction('join') }
  };

  /* Desktop docks the conversation list beside the thread instead of swapping
     between them; mobile keeps the single-pane swap this flag has always
     driven. */
  const homeVisible = props.view === 'home' && !props.activeDm

  /* Orion's dock: slides away while the list scrolls down, back on any scroll
     up, and always returns when the tab changes. */
  const [dockHidden, setDockHidden] = useState(false)
  const lastHomeScrollRef = useRef(0)
  useEffect(() => { setDockHidden(false); lastHomeScrollRef.current = 0 }, [props.homeTab])
  // The new page slides in from the side of the dock its tab sits on.
  const [tabMotion, setTabMotion] = useState({ tab: props.homeTab, dir: 0 })
  if (tabMotion.tab !== props.homeTab) {
    const tabIndex = id => TABS.findIndex(tab => tab.id === id)
    setTabMotion({ tab: props.homeTab, dir: Math.sign(tabIndex(props.homeTab) - tabIndex(tabMotion.tab)) })
  }
  const onHomeScroll = (event) => {
    const top = event.currentTarget.scrollTop
    const delta = top - lastHomeScrollRef.current
    lastHomeScrollRef.current = top
    if (delta > 8 && top > 64) setDockHidden(true)
    else if (delta < -8) setDockHidden(false)
  }

  const conversationId = props.view === 'server' ? props.activeChannel?.id : props.activeDm?.dm_room_id
  const ownId = props.session.user.id
  const unreadIndex = useMemo(() => (
    props.unreadAnchor && props.unreadAnchor.targetId === conversationId
      ? firstUnreadIndex(props.visibleMessages, props.unreadAnchor.at, ownId)
      : -1
  ), [props.unreadAnchor, conversationId, props.visibleMessages, ownId])
  const unreadCount = useMemo(() => countUnreadFrom(props.visibleMessages, unreadIndex, ownId), [props.visibleMessages, unreadIndex, ownId])
  // The jump bar shows only while the divider sits above the visible area.
  const [unreadDivider, setUnreadDivider] = useState(null)
  const [dividerAbove, setDividerAbove] = useState(false)
  useEffect(() => {
    const root = props.scrollContainerRef.current
    if (!unreadDivider || !root) { setDividerAbove(false); return }
    const observer = new IntersectionObserver(([entry]) => {
      setDividerAbove(!entry.isIntersecting && entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0))
    }, { root })
    observer.observe(unreadDivider)
    return () => observer.disconnect()
  }, [unreadDivider, props.scrollContainerRef])
  const jumpToUnread = () => unreadDivider?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  const { clearUnreadAnchor, scrollToLatestMessages } = props
  // Esc: Discord's "mark read and jump to present", when nothing else claims it.
  useEffect(() => {
    if (!conversationId) return
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      const target = event.target
      if (target?.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"], [aria-modal="true"]')) return
      if (document.querySelector('[aria-modal="true"]')) return
      clearUnreadAnchor?.()
      scrollToLatestMessages?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [conversationId, clearUnreadAnchor, scrollToLatestMessages])

  /* Desktop list column (rail included), in rem so UI density scales it too. */
  const [listWidth, setListWidth] = useStoredState('messapp.listWidth.v2', LIST_WIDTH_DEFAULT)
  const listSectionRef = useRef(null)
  const startListResize = (event) => {
    if (event.button !== 0) return
    event.preventDefault()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    const left = listSectionRef.current.getBoundingClientRect().left
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    const onMove = (moveEvent) => setListWidth(clampListWidth((moveEvent.clientX - left) / rem))
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      handle.removeEventListener('pointercancel', onUp)
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
    handle.addEventListener('pointercancel', onUp)
  }
  const onListResizeKey = (event) => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key]
    if (event.key === 'Home') setListWidth(clampListWidth(0))
    else if (event.key === 'End') setListWidth(clampListWidth(Infinity))
    else if (step) setListWidth(width => clampListWidth(width + step))
    else return
    event.preventDefault()
  }
  const headerPanelButton = (tab, Icon, label, title) => {
    const active = props.showRightSidebar && props.rightTab === tab
    return (
      <button type="button" onClick={() => props.toggleRightSidebar(tab)} className={`flex h-11 w-11 items-center justify-center rounded-2xl transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] ${active ? 'bg-[var(--theme-20)] text-[var(--theme-base)]' : 'text-gray-400 hover:bg-[var(--bg-surface)] hover:text-[var(--theme-base)]'}`} aria-label={label} aria-pressed={active} title={title}>
        <Icon size={20} aria-hidden="true" />
      </button>
    )
  }
  // Arrows move between rows; the list itself is a single Tab stop.
  const onListKeyDown = (event) => {
    if (!event.target.matches?.('[data-conv-row]') || event.altKey || event.ctrlKey || event.metaKey) return
    const rows = [...event.currentTarget.querySelectorAll('[data-conv-row]')]
    const from = rows.indexOf(event.target)
    const to = event.key === 'ArrowDown' ? stepRowIndex(rows, from, 1)
      : event.key === 'ArrowUp' ? stepRowIndex(rows, from, -1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? rows.length - 1
      : null
    if (to === null) return
    event.preventDefault()
    rows[to]?.focus()
  }
  const openServerFromRail = (server) => {
    selectHomeTab('servers')
    setServersPanelView('detail')
    props.setView('home')
    props.setActiveServer(server)
    props.setActiveChannel(null)
  }
  // Picking a rail tab while the list is collapsed means "show me that list".
  const selectHomeTab = (tab) => {
    if (props.listCollapsed) props.setListCollapsed(false)
    props.setHomeTab(tab)
  }

  return (
      <main
        id="messapp-main"
        tabIndex={-1}
        className="flex-1 flex flex-col min-h-0 min-w-0 max-w-full overflow-hidden relative bg-[var(--bg-base)] md:flex-row"
        style={props.scopedChatStyle}
        onPaste={props.handlePaste}
        onPointerDownCapture={(e) => {
          startEdgeGesture(e)
          if (!props.messageActionMenuId) return

          const target = e.target

          if (
            target.closest?.('.message-action-toolbar') ||
            target.closest?.('.messapp-reaction-popover') ||
            target.closest?.('.message-touch-target') ||
            target.closest?.('.EmojiPickerReact')
          ) {
            return
          }

          props.setMessageActionMenuId(null)
        }}
        onPointerUpCapture={finishEdgeGesture}
        onPointerCancelCapture={() => { edgeGestureRef.current = null }}
      >
      {/* Nav rail + conversation list. Hidden on mobile while a thread is open,
          always docked from md up — that is what turns the single-pane phone
          layout into the three-column desktop one. */}
      <section
        ref={listSectionRef}
        className={`relative min-h-0 min-w-0 flex-col md:flex md:flex-none md:flex-row-reverse ${props.listCollapsed ? '' : 'md:w-[var(--list-w)]'} ${homeVisible ? 'flex flex-1' : 'hidden'}`}
        style={{ '--list-w': `${listWidth}rem` }}
      >
        <div id="conversation-list" className={`home-dashboard relative flex min-h-0 flex-1 flex-col overflow-hidden md:border-r md:border-[var(--border-subtle)] ${props.listCollapsed ? 'md:hidden' : ''}`}>
          {/* Minimal header: the wordmark. The account avatar is the dock's Menu tab. Search lives in
              the quick actions button. The dock names the tab. */}
          <header className="ios-app-bar flex h-16 shrink-0 items-center gap-1 pl-4 pr-2 md:pl-5">
            <h1 className="sr-only">{TABS.find(tab => tab.id === props.homeTab)?.label}</h1>
            <span className="min-w-0 flex-1 truncate type-view-title font-bold lowercase tracking-[-0.045em] text-[var(--text-main)]" aria-hidden="true">messapp</span>
            <button type="button" onClick={() => props.setListCollapsed(true)} className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-element)] hover:text-[var(--text-main)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] md:flex" aria-label="Hide conversation list" aria-controls="conversation-list" aria-expanded="true" title="Hide list (Ctrl+B)">
              <PanelLeftClose size={20} aria-hidden="true" />
            </button>
          </header>
          {/* The FAB is positioned against this wrapper, not the shell, so its
              bottom edge lands exactly where the bottom bar starts. */}
          <div className="relative flex min-h-0 flex-1 flex-col">
            {/* Keyed so each tab mounts fresh: replays the entrance and starts at the top. */}
            <div key={props.homeTab} className="home-tab-page min-h-0 flex-1 overflow-y-auto custom-scrollbar" style={{ '--tab-dir': tabMotion.dir }} onScroll={onHomeScroll} onKeyDown={onListKeyDown}>
              {props.homeTab === 'menu' ? (
                <MenuPage {...props} />
              ) : props.homeTab === 'servers' ? (
                <ServersPage
                  {...props}
                  panelView={serversPanelView}
                  setPanelView={setServersPanelView}
                  pendingServerAction={pendingServerAction}
                  onServerActionHandled={() => setPendingServerAction(null)}
                />
              ) : props.homeTab === 'notifs' ? (
                <NotificationsPage {...props} />
              ) : props.homeTab === 'add' ? (
                <AddFriendView session={props.session} allFriends={props.allFriends} getPresenceLabel={props.getPresenceLabel} getPresenceStatus={props.getPresenceStatus} openDmContact={openDmContact} startingDmProfileId={props.startingDmProfileId} />
              ) : (
                <ChatsPage {...props} />
              )}
            </div>
            {/* Friends has its own input in the FAB's spot above the dock, so the FAB lifts over it. */}
            {props.homeTab !== 'menu' && <QuickActionsFab {...quickActions} lifted={props.homeTab === 'add'} />}
          </div>
        </div>
        <BottomBar
          homeTab={props.homeTab}
          setHomeTab={selectHomeTab}
          servers={props.servers}
          activeServerId={props.activeServer?.id}
          onOpenServer={openServerFromRail}
          onAddServer={() => { selectHomeTab('servers'); setServersPanelView('list'); setPendingServerAction('create') }}
          notificationCount={props.notificationCount}
          avatarUrl={props.myAvatar || props.session.user.user_metadata?.avatar_url}
          username={props.myUsername || props.session.user.user_metadata?.username || props.session.user.email}
          // Friends' input lives in the dock, so it must not slide away mid-typing.
          hidden={dockHidden && props.homeTab !== 'add'}
          expanded={props.homeTab === 'add'}
        />
      </section>

      {!props.listCollapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize conversation list"
          aria-controls="conversation-list"
          aria-valuenow={Math.round(listWidth)}
          aria-valuemin={clampListWidth(0)}
          aria-valuemax={clampListWidth(Infinity)}
          tabIndex={0}
          title="Drag to resize. Double-click to reset."
          onPointerDown={startListResize}
          onKeyDown={onListResizeKey}
          onDoubleClick={() => setListWidth(LIST_WIDTH_DEFAULT)}
          className="list-resize-handle relative -mx-1 hidden w-2 shrink-0 cursor-col-resize touch-none outline-none md:block"
        />
      )}

      <section className={`chat-surface min-h-0 min-w-0 flex-col bg-[var(--chat-bg-base)] md:flex md:flex-1 md:overflow-hidden ${homeVisible ? 'hidden' : 'flex flex-1'}`}>
      {/* Voice channels have no top bar on desktop: the stage is the whole
          view. Phones keep it for the back button only. */}
      <header
        className={`ios-app-bar h-16 flex items-center justify-between px-4 md:px-6 shrink-0 z-30 ${props.view === 'server' && isVoiceChannel ? 'md:hidden' : ''}`}
        style={props.isChatActive ? { backgroundColor: 'var(--chat-bg-surface)' } : undefined}
      >
        <div className="flex items-center gap-3 md:gap-4 min-w-0 flex-1">
          {/* Back only matters on mobile — from md up the list it returns to is
              already on screen. */}
          {props.isChatActive && (
            <button type="button" onClick={props.handleBack} className="flex md:hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl text-gray-400 outline-none transition-colors hover:bg-[var(--bg-element)] hover:text-[var(--text-main)] focus-visible:ring-2 focus-visible:ring-[var(--theme-base)]" aria-label="Back">
              <ChevronLeft size={22} aria-hidden="true" />
            </button>
          )}
          {props.view === 'home' && props.activeDm ? (
            <div className="flex items-center gap-2 md:gap-3 min-w-0 animate-fade-in" key={`header-dm-${props.activeDm.dm_room_id}`}>
                <StatusAvatar url={props.activeDm.profiles.avatar_url} username={props.activeDm.profiles.username} status={props.getPresenceStatus?.(props.activeDm.profiles.id)} className="w-9 h-9" loading="eager" />
                <div className="min-w-0">
                  <h2 className="font-display font-bold text-[var(--chat-text,var(--text-main))] type-title tracking-tight truncate">{props.activeDm.profiles.username}</h2>
                  <p className="type-meta font-semibold text-gray-500 leading-none">{props.getPresenceLabel?.(props.activeDm.profiles.id) || 'Offline'}</p>
                </div>
            </div>
          ) : props.view === 'server' && props.activeChannel && !isVoiceChannel ? (
            <div className="flex items-center gap-2 md:gap-3 min-w-0 animate-fade-in" key={`header-chan-${props.activeChannel.id}`}>
              {isVoiceChannel ? <Volume2 size={20} className="text-gray-500 shrink-0" aria-hidden="true" /> : <Hash size={20} className="text-gray-500 shrink-0" aria-hidden="true" />}
              <h2 className="font-display font-bold text-[var(--chat-text,var(--text-main))] type-title tracking-tight truncate">{props.activeChannel.name}</h2>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-1 md:gap-2 shrink-0 ml-2 md:ml-4">
          {props.isChatActive && !(props.view === 'server' && isVoiceChannel) && (
            <>
              {props.view === 'home' && props.activeDm && <button onClick={() => props.startCall(false)} className="flex h-11 w-11 items-center justify-center rounded-2xl transition-colors shrink-0 cursor-pointer text-gray-400 hover:bg-[var(--bg-surface)] hover:text-[var(--theme-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)]" aria-label="Start voice call" title="Voice call"><Phone size={20} aria-hidden="true" /></button>}
              {props.view === 'home' && props.activeDm && <button onClick={() => props.startCall(true)} className="flex h-11 w-11 items-center justify-center rounded-2xl transition-colors shrink-0 cursor-pointer text-gray-400 hover:bg-[var(--bg-surface)] hover:text-[var(--theme-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)]" aria-label="Start video call" title="Video call"><Video size={20} aria-hidden="true" /></button>}
              {props.view === 'home' && props.activeDm && <div className="w-[1px] h-6 bg-[var(--border-subtle)] mx-1"></div>}
              {props.view === 'server' && headerPanelButton('members', Users, 'Show members', 'Members')}
              <button onClick={() => props.toggleRightSidebar('info')} className={`flex h-11 w-11 items-center justify-center rounded-2xl transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] ${props.rightTab === 'info' && props.showRightSidebar ? 'bg-[var(--theme-20)] text-[var(--theme-base)]' : 'text-gray-400 hover:bg-[var(--bg-surface)] hover:text-[var(--theme-base)]'}`} aria-label="Show conversation details" aria-pressed={props.rightTab === 'info' && props.showRightSidebar} title="Conversation details"><Info size={20} aria-hidden="true" /></button>
            </>
          )}
        </div>
      </header>

      {props.activeVoiceSession && (
        <Suspense fallback={null}>
        <SfuScreenShare
          roomId={props.activeVoiceSession.roomId}
          createClient={props.screenShareClientFactory}
          variant={props.isViewingActiveVoiceChannel ? 'full' : 'mini'}
          title={`${props.activeVoiceSession.serverName} / ${props.activeVoiceSession.channelName}`}
          currentUser={{
            id: props.session.user.id,
            displayName: props.myUsername || props.session.user.user_metadata?.username || props.session.user.email?.split('@')[0],
            avatarUrl: props.myAvatar || props.session.user.user_metadata?.avatar_url
          }}
          focusRequest={props.voiceFocusRequest}
          muted={props.voiceMuted}
          deafened={props.voiceDeafened}
          onToggleMute={() => props.setVoiceMuted?.(value => !value)}
          onToggleDeafen={toggleVoiceDeafened}
          onLeave={props.leaveActiveVoice}
          onOpen={props.openActiveVoiceChannel}
          onStateChange={props.setVoiceSessionState}
        />
        </Suspense>
      )}

      {voiceControlsOpen && isActiveVoiceSession && (
        <div className="fixed inset-0 z-[80] md:hidden" data-ui-overlay-owner="ChatArea:voice-controls">
          <button type="button" className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={() => setVoiceControlsOpen(false)} aria-label="Close voice controls" />
          <section className="voice-controls-drawer absolute inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] rounded-[1.75rem] p-3" role="dialog" aria-modal="true" aria-label="Voice controls">
            <div className="mb-2 flex items-center justify-between px-1">
              <div>
                <p className="type-label font-bold text-[var(--text-main)]">Voice controls</p>
                <p className="type-meta text-[var(--text-muted)]">{props.activeChannel?.name}</p>
              </div>
              <button type="button" onClick={() => setVoiceControlsOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-element)]" aria-label="Close">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <button type="button" onClick={() => props.setVoiceMuted?.(value => !value)} className={`voice-drawer-action ${props.voiceMuted ? 'is-danger' : 'is-live'}`} aria-label={props.voiceMuted ? 'Unmute' : 'Mute'}>
                {props.voiceMuted ? <MicOff size={20} aria-hidden="true" /> : <Mic size={20} aria-hidden="true" />}
                <span>{props.voiceMuted ? 'Unmute' : 'Mute'}</span>
              </button>
              <button type="button" onClick={toggleVoiceDeafened} className={`voice-drawer-action ${props.voiceDeafened ? 'is-danger' : 'is-live'}`} aria-label={props.voiceDeafened ? 'Undeafen' : 'Deafen'}>
                {props.voiceDeafened ? <VolumeX size={20} aria-hidden="true" /> : <Volume2 size={20} aria-hidden="true" />}
                <span>{props.voiceDeafened ? 'Undeafen' : 'Deafen'}</span>
              </button>
              <button type="button" onClick={() => { setVoiceControlsOpen(false); props.openActiveVoiceChannel?.() }} className="voice-drawer-action">
                <MonitorUp size={20} aria-hidden="true" />
                <span>Expand</span>
              </button>
              <button type="button" onClick={() => { setVoiceControlsOpen(false); props.leaveActiveVoice?.() }} className="voice-drawer-action is-danger">
                <PhoneOff size={20} aria-hidden="true" />
                <span>Leave</span>
              </button>
            </div>
          </section>
        </div>
      )}

      {!props.isViewingActiveVoiceChannel && (
      <div className="flex-1 flex min-w-0 max-w-full overflow-hidden relative transition-all duration-300 ease-out transform" style={chatViewportStyle} data-pinned-count={pinnedMessages.length}>
        <div className="flex-1 flex flex-col min-w-0 max-w-full overflow-hidden z-10 relative transition-all duration-300 ease-out transform" key={props.view + (props.activeChannel?.id || props.activeDm?.dm_room_id || '')}>
          {isVoiceChannel ? (
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 pb-36 md:p-8">
              <div className="mx-auto flex max-w-5xl flex-col gap-4">
                <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/90 p-5 md:p-7">
                  <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                    <div className="flex min-w-0 items-center gap-4">
                      <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${isActiveVoiceSession ? 'bg-[var(--status-success)]/15 text-[var(--status-success)]' : 'bg-[var(--theme-20)] text-[var(--theme-base)]'}`}>
                        <Radio size={28} aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className="type-meta font-black uppercase tracking-widest text-gray-500">Voice channel</p>
                        <h3 className="truncate type-view-title font-black text-[var(--text-main)]">{props.activeChannel.name}</h3>
                        <p className={`mt-1 type-label font-bold ${isActiveVoiceSession ? 'text-[var(--status-success)]' : voiceChannelParticipants.length > 0 ? 'text-[var(--theme-base)]' : 'text-gray-400'}`}>
                          {isActiveVoiceSession
                            ? `Connected - ${props.voiceSessionState?.status || 'connecting'}`
                            : voiceChannelParticipants.length > 0
                              ? `${voiceChannelParticipants.length} waiting inside`
                              : 'Nobody here yet'}
                        </p>
                        {!isActiveVoiceSession && voiceChannelParticipants.length > 0 && (
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex -space-x-2">
                              {voiceChannelParticipants.slice(0, 5).map(participant => (
                                <StatusAvatar
                                  key={participant.id}
                                  url={participant.avatarUrl}
                                  username={participant.displayName}
                                  showStatus={false}
                                  className="h-7 w-7 rounded-full ring-2 ring-[var(--bg-surface)]"
                                />
                              ))}
                            </div>
                            <span className="truncate type-meta font-bold text-gray-400">
                              {voiceChannelParticipants.slice(0, 2).map(participant => participant.displayName).join(', ')}
                              {voiceChannelParticipants.length > 2 ? ` +${voiceChannelParticipants.length - 2} more` : ''}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!isActiveVoiceSession ? (
                        <button
                          type="button"
                          onClick={() => (props.joinVoiceChannel || props.selectChannel)?.(props.activeChannel)}
                          className="inline-flex items-center gap-2 rounded-xl border border-[var(--chat-control-border)] bg-[var(--chat-control-bg)] px-4 py-2.5 type-label font-black text-[var(--chat-control-text)]"
                        >
                          <Phone size={18} aria-hidden="true" />
                          {voiceChannelParticipants.length > 0 ? 'Join them' : 'Join voice'}
                        </button>
                      ) : (
                        <>
                          <button type="button" onClick={() => setVoiceControlsOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-[var(--bg-element)] px-3 py-2.5 type-meta font-bold text-[var(--text-main)] md:hidden" aria-haspopup="dialog" aria-expanded={voiceControlsOpen}>
                            <SlidersHorizontal size={18} aria-hidden="true" />
                            Controls
                          </button>
                          <div className="hidden items-center gap-2 md:flex">
                          <button type="button" onClick={() => props.setVoiceMuted?.(value => !value)} className={`rounded-xl p-2.5 ${props.voiceMuted ? 'bg-red-500/15 text-red-300' : 'bg-[var(--bg-element)] text-gray-300'}`} aria-label={props.voiceMuted ? 'Unmute' : 'Mute'}>
                            {props.voiceMuted ? <MicOff size={18} /> : <Mic size={18} />}
                          </button>
                          <button type="button" onClick={toggleVoiceDeafened} className={`rounded-xl p-2.5 ${props.voiceDeafened ? 'bg-red-500/15 text-red-300' : 'bg-[var(--bg-element)] text-gray-300'}`} aria-label={props.voiceDeafened ? 'Undeafen' : 'Deafen'}>
                            {props.voiceDeafened ? <VolumeX size={18} /> : <Volume2 size={18} />}
                          </button>
                          <button type="button" onClick={props.openActiveVoiceChannel} className="inline-flex items-center gap-2 rounded-xl bg-[var(--app-accent-20)] px-4 py-2.5 type-label font-black text-[var(--accent-bright)]">
                            <MonitorUp size={18} aria-hidden="true" />
                            Open call
                          </button>
                          <button type="button" onClick={props.leaveActiveVoice} className="inline-flex items-center gap-2 rounded-xl bg-red-500/15 px-4 py-2.5 type-label font-black text-red-300">
                            <PhoneOff size={18} aria-hidden="true" />
                            Leave
                          </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-4">
                      <p className="type-meta font-black uppercase tracking-widest text-gray-500">Participants</p>
                      <p className="mt-2 type-view-title font-black text-[var(--text-main)]">{isActiveVoiceSession ? 1 + (props.voiceSessionState?.remoteCount || 0) : voiceChannelParticipants.length}</p>
                    </div>
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-4">
                      <p className="type-meta font-black uppercase tracking-widest text-gray-500">Screen share</p>
                      <p className={`mt-2 type-label font-black ${props.voiceSessionState?.isSharing ? 'text-[var(--status-success)]' : 'text-gray-400'}`}>{props.voiceSessionState?.isSharing ? 'Live' : 'Idle'}</p>
                    </div>
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-4">
                      <p className="type-meta font-black uppercase tracking-widest text-gray-500">You</p>
                      <div className="mt-3 flex items-center gap-3">
                        <StatusAvatar url={props.myAvatar || props.session.user.user_metadata?.avatar_url} username={props.myUsername || props.session.user.user_metadata?.username || props.session.user.email} status="online" className="h-9 w-9" />
                        <div className="min-w-0">
                          <p className="truncate type-label font-bold text-[var(--text-main)]">{props.myUsername || props.session.user.user_metadata?.username || props.session.user.email?.split('@')[0]}</p>
                          <p className="type-meta text-gray-500">{props.voiceMuted ? 'Muted' : 'Mic ready'} / {props.voiceDeafened ? 'Deafened' : 'Listening'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          ) : homeVisible ? (
            /* Only reachable from md up: on mobile this whole column is hidden
               while the list is showing. */
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
              <MessageSquare size={40} className="text-[var(--text-muted)]" aria-hidden="true" />
              <p className="type-title font-bold text-[var(--text-main)]">Pick a conversation</p>
              <p className="type-body text-[var(--text-muted)]">Your messages open here.</p>
            </div>
          ) : (
            <>
              {dividerAbove && unreadCount > 0 && (
                <div className="pointer-events-none relative z-30 h-0">
                  <div className="absolute inset-x-0 top-2 flex justify-center px-4">
                    <div className="premium-menu pointer-events-auto flex items-center gap-1 rounded-full py-1 pl-4 pr-1 shadow-xl">
                      <button type="button" onClick={jumpToUnread} className="type-label font-bold text-[var(--theme-base)] outline-none focus-visible:underline">
                        {unreadCount} new {unreadCount === 1 ? 'message' : 'messages'} · Jump
                      </button>
                      <button type="button" onClick={() => props.clearUnreadAnchor?.()} className="grid h-8 w-8 place-items-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-element)] hover:text-[var(--text-main)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)]" aria-label="Dismiss new messages marker" title="Mark as read (Esc)">
                        <X size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <div 
                className="flex-1 min-w-0 max-w-full overflow-y-auto overflow-x-hidden custom-scrollbar p-4 md:p-8 relative z-10 transition-[padding] duration-300 ease-out touch-pan-y"
                ref={props.scrollContainerRef}
                {...originSwipe}
                role="log"
                aria-label={props.view === 'home' ? `Messages with ${props.activeDm?.profiles?.username || 'this conversation'}` : `Messages in #${props.activeChannel?.name || 'this channel'}`}
                onScroll={props.handleScroll}
                style={{ ...messageListStyle, visibility: isInitialPositionReady ? 'visible' : 'hidden' }}
                data-call-minimized={props.isCallMinimized ? 'true' : undefined}
              >
                {props.isLoadingMore && (
                  <div className="flex justify-center py-4 absolute top-0 left-0 right-0 z-50">
                    <Loader2 className="animate-spin text-[var(--theme-base)]" size={24} />
                  </div>
                )}
                {props.messagesLoading && props.visibleMessages.length === 0 && (
                  <div className="flex min-h-full flex-col justify-end gap-4 pb-6" aria-label="Loading messages">
                    {Array.from({ length: 7 }, (_, index) => {
                      const isOwn = index % 3 === 1
                      return (
                        <div key={`message-skeleton-${index}`} className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : ''}`} aria-hidden="true">
                          <div className="skeleton h-8 w-8 shrink-0 rounded-full" />
                          <div className={`skeleton rounded-2xl ${isOwn ? 'is-own' : ''} ${index % 2 === 0 ? 'h-14 w-[min(72%,28rem)]' : 'h-10 w-[min(52%,20rem)]'}`} />
                        </div>
                      )
                    })}
                  </div>
                )}
                {props.visibleMessages.length === 0 && (props.activeChannel || props.activeDm) && !props.isLoadingMore && !props.messagesLoading && (
                  <div className="flex flex-col justify-end h-full min-h-[300px] max-w-2xl pb-10">
                    <h3 className="font-display type-display font-bold tracking-tight mb-2 text-[var(--chat-text,var(--text-main))]">{props.view === 'home' ? `This is the start of your chat with ${props.activeDm?.profiles?.username || 'them'}` : `Welcome to #${props.activeChannel?.name}`}</h3>
                    <p className="text-[var(--text-muted)] type-label leading-relaxed">{props.view === 'home' ? 'No messages yet. Say hi.' : 'No messages yet. Start the conversation.'}</p>
                  </div>
                )}
                {props.visibleMessages.map((m, index, renderedMessages) => {
                  const uniqueKey = m.id ? `msg-${m.id}` : `fallback-${index}`;
                  const isMessageBlocked = props.blockedUsersSet.has(m.profile_id);
                  if (isMessageBlocked) return (
                    <div key={uniqueKey} className="text-center my-4"><span className="type-meta font-bold uppercase tracking-widest text-gray-500 bg-[var(--bg-surface)] px-4 py-1.5 rounded-full ghost-border shadow-sm">Message Hidden (Blocked User)</span></div>
                  )
                  const previousMessage = renderedMessages[index - 1]
                  const showHeader = index === 0 || previousMessage.profile_id !== m.profile_id || messageOrigin(previousMessage) !== messageOrigin(m) || Date.parse(m.created_at) - Date.parse(previousMessage.created_at) > 300000;
                  const isMe = m.profile_id === props.session.user.id;
                  const alignRight = isMe;
                  const isEditing = props.editingMessageId === m.id;
                  const isHighlighted = props.highlightedMessageId === m.id;
                  // Narrowed per row so one message's edit/delete state does not
                  // re-render every other row through MemoizedMessage.
                  const isInlineDeleting = props.inlineDeleteMessageId === m.id;
                  const repliedMsg = m.reply_to_message_id ? validMessagesById.get(m.reply_to_message_id) : null;
                  return (
                    <React.Fragment key={uniqueKey}>
                    {index === unreadIndex && (
                      <div ref={setUnreadDivider} className="my-3 flex items-center gap-3" role="separator" aria-label="New messages">
                        <span className="h-px flex-1 bg-[var(--theme-base)] opacity-60" aria-hidden="true" />
                        <span className="type-meta font-bold uppercase tracking-wider text-[var(--theme-base)]">New messages</span>
                        <span className="h-px flex-1 bg-[var(--theme-base)] opacity-60" aria-hidden="true" />
                      </div>
                    )}
                    <MemoizedMessage 
                      m={m}
                      isMe={isMe}
                      showHeader={showHeader}
                      alignRight={alignRight}
                      isHighlighted={isHighlighted}
                      currentUserId={props.session.user.id}
                      isEditing={isEditing}
                      editContent={isEditing ? props.editContent : ''}
                      setEditContent={props.setEditContent}
                      handleUpdateMessage={props.handleUpdateMessage}
                      handleToggleMessageSpoiler={props.handleToggleMessageSpoiler}
                      handleToggleAttachmentSpoiler={props.handleToggleAttachmentSpoiler}
                      setEditingMessageId={props.setEditingMessageId}
                      inlineDeleteMessageId={isInlineDeleting ? m.id : null}
                      inlineDeleteStep={isInlineDeleting ? props.inlineDeleteStep : null}
                      setInlineDeleteMessageId={props.setInlineDeleteMessageId}
                      setInlineDeleteStep={props.setInlineDeleteStep}
                      executeInlineDelete={props.executeInlineDelete}
                      canModerateMessage={props.view === 'server' && MODERATOR_ROLES.includes(props.activeServerRole)}
                      myMention={myMention}
                      toggleReaction={props.toggleReaction}
                      setReplyingTo={props.setReplyingTo}
                      repliedMsg={repliedMsg}
                      scrollToMessage={props.scrollToMessage}
                      setSelectedImage={props.setSelectedImage}
                      togglePinnedMessage={props.togglePinnedMessage}
                      presenceStatus={props.getPresenceStatus?.(m.profile_id)}
	                      peerReadAt={props.peerReadAt}
	                      peerOnline={props.view === 'home' && (props.getPresenceStatus?.(props.activeDm?.profiles?.id) ?? 'offline') !== 'offline'}
	                      retryFailedMessage={props.retryFailedMessage}
	                      showDeliveryStatus={m.id === latestOutgoingMessageId}
	                      messageActionMenuId={props.messageActionMenuId}
	                      setMessageActionMenuId={props.setMessageActionMenuId}
	                      setMessageActionMenuPosition={props.setMessageActionMenuPosition}
	                      onReportMessage={props.onReportMessage}
	                      onForwardMessage={props.onForwardMessage}
	                      onOpenThread={props.view === 'server' ? setOpenThreadId : undefined}
	                    />
                    </React.Fragment>
                  )
                })}
                {/* Taller when the dots pill floats over the bottom, so it never covers the last message. */}
                <div ref={props.messagesEndRef} className={originSwipeEnabled ? 'h-16' : 'h-4'} />
              </div>
              {props.showLatestMessagesButton && (
                <div className="pointer-events-none relative z-30 h-0">
                  <button
                    type="button"
                    onClick={props.scrollToLatestMessages}
                    className="premium-menu pointer-events-auto absolute bottom-3 left-1/2 grid h-10 w-10 -translate-x-1/2 place-items-center rounded-full text-[var(--theme-base)] shadow-xl transition-all hover:border-[var(--theme-50)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] cursor-pointer"
                    aria-label="Jump to latest messages"
                    title="Latest messages"
                  >
                    <ChevronDown size={20} aria-hidden="true" />
                  </button>
                </div>
              )}
              {props.isBlocked ? (
                <div className="p-4 mx-4 md:mx-6 mb-4 md:mb-6 text-center text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl font-bold type-label shadow-inner z-10 relative">
                  {originDots}
                  You cannot reply to this conversation. {props.blockReason}
                </div>
              ) : (
                <div ref={emojiPickerRef} className="p-2 md:p-4 pt-0 shrink-0 bg-transparent z-10 relative flex flex-col">
                  {props.connectionLost && (
                    <div role="status" className="mx-2 mb-2 flex items-center gap-2 rounded-xl bg-[var(--bg-element)] px-3 py-2 type-meta text-[var(--text-muted)]">
                      <WifiOff size={14} aria-hidden="true" />
                      Reconnecting. New messages will show up once you&apos;re back online.
                    </div>
                  )}
                  {!sendHintSeen && !sendIsVoice && !props.editingMessageId && (
                    <p className="mx-3 mb-1 self-end type-meta text-[var(--text-muted)]">Hold Send for spoiler and disappearing messages</p>
                  )}
                  {props.typingUsers.length > 0 && (
                    <div className={`absolute ${originSwipeEnabled ? '-top-12' : '-top-5'} left-6 flex items-center gap-2 type-meta font-bold text-[var(--theme-base)] animate-fade-in pointer-events-none z-20`}>
                      <div className="flex items-center gap-1 px-1">
                        <span className="w-1 h-1 bg-[var(--theme-base)] rounded-full typing-dot" style={{ animationDelay: '0ms' }}></span>
                        <span className="w-1 h-1 bg-[var(--theme-base)] rounded-full typing-dot" style={{ animationDelay: '150ms' }}></span>
                        <span className="w-1 h-1 bg-[var(--theme-base)] rounded-full typing-dot" style={{ animationDelay: '300ms' }}></span>
                      </div>
                      <span>{props.typingUsers.length === 1 ? `${props.typingUsers[0].username} is typing...` : `${props.typingUsers.length} people are typing...`}</span>
                    </div>
                  )}
                  {props.replyingTo && (
                    <div className="bg-[var(--theme-20)] px-4 py-2 mb-2 mx-2 rounded-xl flex items-center justify-between type-label animate-fade-in">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-[var(--theme-base)] whitespace-nowrap">Replying to {props.replyingTo.profiles?.username}</span>
                        <span className="truncate text-gray-300 max-w-[150px] md:max-w-[300px]">{props.replyingTo.is_spoiler ? 'Spoiler' : stripEffects(props.replyingTo.content) || 'Attachment'}</span>
                      </div>
                      <button type="button" onClick={() => props.setReplyingTo(null)} aria-label="Cancel reply" className="grid h-8 w-8 place-items-center text-[var(--text-muted)] hover:text-[var(--text-main)] ml-2 rounded-full hover:bg-[var(--bg-element-hover)] transition-colors cursor-pointer shrink-0"><X size={14} aria-hidden="true" /></button>
                    </div>
                  )}
                  {props.pendingFiles?.length > 0 && (
                    <div className="premium-section mx-2 mb-3 rounded-2xl p-3 animate-slide-up">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <span className="type-meta font-bold uppercase tracking-widest text-[var(--theme-base)]">{props.isUploading ? 'Uploading' : 'Ready to send'}</span>
                          <p className="truncate type-meta text-gray-500">{props.pendingFiles.length}/{props.maxPendingAttachments || 10} {props.pendingFiles.length === 1 ? 'attachment' : 'attachments'} • Add a caption below</p>
                        </div>
                        <button type="button" onClick={() => props.setPendingFiles([])} className="rounded-full bg-red-500/10 p-2 text-red-500 transition-colors hover:bg-red-500 hover:text-white" aria-label="Remove all attachments"><X size={18}/></button>
                      </div>
                      <div className="flex max-w-full gap-2 overflow-x-auto pb-1 custom-scrollbar">
                        {props.pendingFiles.map((item, index) => (
                          <div key={item.id || `${item.name}-${item.size}-${index}`} className={`group relative shrink-0 overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-base)] ${item.type === 'audio' ? 'h-14 w-64 rounded-full' : 'h-24 w-24 rounded-xl'}`}>
                            {item.type === 'audio' ? (
                              pendingPreviewUrls[index] && (
                                <VoiceMessagePlayer
                                  src={pendingPreviewUrls[index]}
                                  label="Voice message ready"
                                  className="h-full w-full bg-transparent pr-8"
                                />
                              )
                            ) : pendingPreviewUrls[index] && item.type === 'video' ? (
                              <video
                                src={pendingPreviewUrls[index]}
                                className="h-full w-full bg-black object-cover"
                                muted
                                playsInline
                                preload="metadata"
                                onLoadedMetadata={primeVideoPreview}
                                onLoadedData={primeVideoPreview}
                                onCanPlay={primeVideoPreview}
                              />
                            ) : pendingPreviewUrls[index] ? (
                              <img src={pendingPreviewUrls[index]} alt={item.name || 'Attachment preview'} className={`h-full w-full object-cover ${item.isSpoiler ? 'scale-110 blur-lg' : ''}`} />
                            ) : (
                              <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-2"><FileText size={28} className="text-[var(--theme-base)]" /><span className="w-full truncate text-center type-meta text-gray-400">{item.name}</span></div>
                            )}
                            <button type="button" onClick={() => props.removePendingFile(index)} className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white" aria-label={`Remove ${item.name}`}><X size={12}/></button>
                            {(item.type === 'image' || item.type === 'video') && item.file && !item.gifUrl && (
                              <button
                                type="button"
                                onClick={() => openPendingMediaEditor(item, index)}
                                className="absolute bottom-5 right-1 rounded-full bg-black/75 p-1.5 text-white shadow-lg hover:bg-[var(--theme-base)]"
                                aria-label={`Edit ${item.name}`}
                                title="Crop or edit"
                              >
                                <SlidersHorizontal size={12} />
                              </button>
                            )}
                            {(item.type === 'image' || item.gifUrl) && (
                              <button
                                type="button"
                                onClick={() => props.togglePendingFileSpoiler(index)}
                                className={`absolute left-1 top-1 rounded-full p-1.5 text-white shadow ${item.isSpoiler ? 'bg-amber-500' : 'bg-black/70'}`}
                                aria-pressed={Boolean(item.isSpoiler)}
                                aria-label={item.isSpoiler ? `Remove spoiler from ${item.name}` : `Mark ${item.name} as spoiler`}
                                title={item.isSpoiler ? 'Remove image spoiler' : 'Mark image as spoiler'}
                              >
                                <EyeOff size={12} />
                              </button>
                            )}
                            {item.isSpoiler && (
                              <span className="pointer-events-none absolute inset-0 flex items-center justify-center type-meta font-black uppercase tracking-widest text-white drop-shadow">Spoiler</span>
                            )}
                            {props.isUploading && <div className="absolute inset-0 flex items-center justify-center bg-black/45"><Loader2 size={24} className="animate-spin text-white" /></div>}
                            {item.type !== 'audio' && <span className="absolute bottom-0 left-0 right-0 truncate bg-black/70 px-1 py-0.5 type-meta text-white">{item.type === 'video' ? 'VIDEO • ' : item.gifUrl ? 'GIF • ' : item.type === 'image' ? 'IMAGE • ' : ''}{formatPendingFileSize(item.size)}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {props.editingMessageId && (
                    <div className="premium-section mx-2 md:mx-4 mb-2 rounded-2xl border border-[var(--theme-50)] bg-[var(--theme-20)] px-3 py-2.5 animate-slide-up">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="type-meta font-black uppercase tracking-widest text-[var(--theme-base)]">
                            Editing message
                          </div>
                          <div className="mt-1 truncate type-label font-medium text-[var(--chat-text,var(--text-main))]">
                            {props.editContent || 'Add a caption'}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            props.setEditingMessageId(null)
                            props.setEditContent('')
                          }}
                          className="rounded-full p-1.5 text-gray-400 hover:bg-white/10 hover:text-[var(--text-main)]"
                          aria-label="Cancel edit"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      {editingMessage && (editingMessage.content || props.editContent) && (
                        <button
                          type="button"
                          onClick={() => props.handleToggleMessageSpoiler(editingMessage)}
                          className={`mt-2 flex items-center gap-1.5 rounded-full px-3 py-1.5 type-meta font-bold md:hidden ${editingMessage?.is_spoiler ? 'bg-amber-500/20 text-amber-300' : 'bg-white/10 text-gray-300'}`}
                          aria-pressed={Boolean(editingMessage?.is_spoiler)}
                        >
                          {editingMessage?.is_spoiler ? <Eye size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}
                          {editingMessage?.is_spoiler ? 'Remove spoiler' : 'Mark as spoiler'}
                        </button>
                      )}

                      <div className="mt-2 flex justify-end gap-2 md:hidden">
                        <button
                          type="button"
                          onClick={() => {
                            props.setEditingMessageId(null)
                            props.setEditContent('')
                          }}
                          className="rounded-full bg-white/10 px-3 py-1.5 type-meta font-bold text-[var(--text-main)]"
                        >
                          Cancel
                        </button>

                        <button
                          type="button"
                          onClick={(e) => props.handleUpdateMessage(e, props.editingMessageId, { allowEmpty: true })}
                          className="rounded-full border border-[var(--chat-control-border)] bg-[var(--chat-control-bg)] px-3 py-1.5 type-meta font-bold text-[var(--chat-control-text)]"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  )}
                  {voiceRecorderState.status !== 'idle' && (
                    <div className="mx-2 mb-2 flex h-14 items-center gap-2 rounded-full border border-[var(--chat-border,var(--border-subtle))] bg-[var(--chat-bg-base,var(--bg-base))] px-2 md:mx-4" role="status" aria-live="polite">
                      {/* Left: the three states the gesture can be in, lit one at a
                          time — holding, locked hands-free, about to discard.
                          Middle: the level meter. Right: elapsed time and stop. */}
                      <div className="flex shrink-0 items-center gap-1">
                        <span className={`grid h-8 w-8 place-items-center rounded-full transition-all ${voiceStage === 'hold' ? 'scale-110 bg-[var(--chat-control-bg)] text-[var(--chat-control-text)] ring-1 ring-[var(--chat-control-border)]' : 'text-[var(--text-subtle)]'}`}>
                          <Mic size={16} aria-hidden="true" />
                        </span>
                        <span className={`grid h-8 w-8 place-items-center rounded-full transition-all ${voiceStage === 'lock' ? 'scale-110 bg-[var(--chat-control-bg)] text-[var(--chat-control-text)] ring-1 ring-[var(--chat-control-border)]' : 'text-[var(--text-subtle)]'}`}>
                          <Lock size={16} aria-hidden="true" />
                        </span>
                        {/* Still a button: once the take is locked the thumb is off
                            the send button and this is the only way to bin it. */}
                        <button
                          type="button"
                          onClick={() => finishVoiceRecording(true)}
                          disabled={voiceRecorderState.status === 'stopping'}
                          className={`grid h-8 w-8 place-items-center rounded-full transition-all disabled:opacity-50 ${voiceStage === 'cancel' ? 'scale-110 bg-rose-500 text-white' : 'text-[var(--text-subtle)] hover:bg-rose-500/10 hover:text-rose-400'}`}
                          aria-label="Discard voice recording"
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </div>
                      <div className="flex h-8 min-w-0 flex-1 items-center gap-[2px] overflow-hidden" aria-label="Live microphone level">
                        {voiceLevels.slice(-20).map((level, index) => (
                          <span
                            key={index}
                            className={`min-w-[2px] flex-1 rounded-full transition-[height] duration-75 ${voiceStage === 'cancel' ? 'bg-rose-500' : 'bg-[var(--theme-base)]'}`}
                            style={{ height: `${Math.max(18, level * 100)}%`, opacity: 0.35 + level * 0.65 }}
                          />
                        ))}
                      </div>
                      <span className="w-10 shrink-0 text-right type-meta font-bold tabular-nums text-gray-400">{formatVoiceMessageDuration(voiceRecorderState.elapsed)}</span>
                      <button type="button" onClick={() => finishVoiceRecording(false)} disabled={voiceRecorderState.status === 'stopping'} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--chat-control-border)] bg-[var(--chat-control-bg)] text-[var(--chat-control-text)] shadow-sm transition-transform active:scale-95 disabled:opacity-50" aria-label="Stop and preview voice recording">
                        {voiceRecorderState.status === 'stopping' ? <Loader2 size={17} className="animate-spin" /> : <Square size={12} fill="currentColor" />}
                      </button>
                      <span className="sr-only">
                        {voiceStage === 'cancel' ? 'Release to discard' : voiceStage === 'lock' ? 'Recording hands-free' : 'Holding to record. Drag up to lock, anywhere else to discard'}
                      </span>
                      <span className="sr-only">{voiceRecorderState.status === 'stopping' ? 'Preparing voice message' : 'Recording voice message'}</span>
                    </div>
                  )}
                  {originDots}
                  <form
                    onSubmit={(e) => {
                        if (props.editingMessageId) {
                          props.handleUpdateMessage(e, props.editingMessageId, { allowEmpty: true })
                        } else {
                          props.handleSendMessage(e)
                          syncComposer()
                          setSendOptionsOpen(false)
                        }
                      }
                    }
                    className="premium-composer chat-glass rounded-3xl flex items-center gap-2 p-1.5 transition-all duration-300 ease-out transform relative mt-1 mx-2 md:mx-4 mb-2 md:mb-4">
                    <div ref={gifPickerRef} onTouchStartCapture={() => { blurComposer(); }}>
                      {props.showGifPicker && (
                        <Suspense fallback={null}>
                          <GifPickerPopout
                            onSelectGif={props.handleSendGif}
                            onClose={() => props.setShowGifPicker(false)}
                          />
                        </Suspense>
                      )}
                    </div>
                    {/* One flat row rather than a stacked menu: five destinations
                        read faster side by side, and the row lands under the
                        thumb instead of climbing the screen away from it. */}
                    <div ref={attachMenuRef} className="relative shrink-0 flex items-center justify-center w-[44px] h-[44px]">
                      {showAttachMenu && (
                        <div
                          role="group"
                          aria-label="Attachment options"
                          className="premium-menu absolute bottom-full left-0 mb-3 z-50 flex gap-1 rounded-2xl p-1.5 animate-slide-up origin-bottom-left"
                          onTouchStartCapture={() => { blurComposer(); }}
                          onKeyDown={(e) => { if (e.key === 'Escape') setShowAttachMenu(false) }}
                        >
                          {attachOptions.map(({ id, label, Icon, open }) => (
                            <button
                              key={id}
                              type="button"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowAttachMenu(false); open(e); }}
                              className="flex w-[60px] shrink-0 cursor-pointer flex-col items-center gap-1 rounded-xl px-1 py-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-element)] hover:text-[var(--theme-base)]"
                            >
                              <Icon size={20} aria-hidden="true" />
                              <span className="type-meta font-semibold">{label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); blurComposer(); setShowAttachMenu(!showAttachMenu); }} disabled={props.isUploading} aria-expanded={showAttachMenu} aria-label="Attach" className="premium-icon-button w-full h-full flex items-center justify-center rounded-full cursor-pointer">
                        {props.isUploading ? <Loader2 className="animate-spin text-[var(--text-main)]" size={20} /> : <Plus size={22} className={`transition-transform duration-200 ${showAttachMenu ? 'rotate-45' : ''}`} />}
                      </button>
                    </div>
                    <input type="file" accept="image/*,video/*,.gif" multiple ref={props.fileInputRef} onChange={props.handleFileUpload} onClick={(e) => { e.currentTarget.value = '' }} className="hidden" />
                    <input type="file" accept="image/*" capture="environment" ref={cameraPhotoInputRef} onChange={props.handleFileUpload} onClick={(e) => { e.currentTarget.value = '' }} className="hidden" />
                    <input type="file" accept="video/*" capture="environment" ref={cameraVideoInputRef} onChange={props.handleFileUpload} onClick={(e) => { e.currentTarget.value = '' }} className="hidden" />
                    <input type="file" accept="*/*" multiple ref={props.genericFileInputRef} onChange={props.handleGenericFileUpload} onClick={(e) => { e.currentTarget.value = '' }} className="hidden" />
                    <div className="flex-1 flex flex-col min-w-0 relative">
                    {mentionCandidates.length > 0 && (
                      <div role="listbox" aria-label="Mention a member" className="premium-menu absolute bottom-full left-0 right-0 mb-2 z-50 max-h-56 overflow-y-auto rounded-2xl p-1 custom-scrollbar">
                        {mentionCandidates.map((member, index) => (
                          <button
                            key={member.profile_id || member.profiles?.username}
                            type="button"
                            role="option"
                            aria-selected={index === mentionIndex}
                            /* mousedown, not click: click lands after the field
                               has already blurred and lost the caret. */
                            onMouseDown={(e) => { e.preventDefault(); insertMention(member) }}
                            onMouseEnter={() => setMentionIndex(index)}
                            className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left type-body ${index === mentionIndex ? 'bg-[var(--bg-element)] text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`}
                          >
                            <span className="truncate font-bold">{member.profiles?.username}</span>
                            {member.role && member.role !== 'member' && (
                              <span className="ml-auto type-meta uppercase tracking-wide text-[var(--text-subtle)]">{member.role}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Black field, hairline edge: the fill used to be
                        --chat-bg-element, a blue-grey slab on an OLED thread. */}
                    <div className="composer-field flex items-center bg-[var(--chat-bg-base,var(--bg-base))] rounded-[22px] relative min-w-0 border border-[var(--chat-border,var(--border-subtle))] min-h-[44px]">
                      <textarea 
                        data-message-composer="true"
                        ref={props.messageInputRef}
                        onFocus={() => { 
                          setShowInputEmojiPicker(false); 
                          props.setShowGifPicker(false); 
                          setShowAttachMenu(false); 
                        }}
                        onBlur={() => { setMentionQuery(null); debug.debug('COMPOSER', { operation: 'blur', hadText: Boolean(props.messageInputRef.current?.value) }) }}
                        onInput={syncComposer}
                        onPaste={props.handlePaste}
                        onBeforeInput={props.handleBeforeInput}
                        className="flex-1 bg-transparent border-none outline-none text-[var(--chat-text,var(--text-main))] resize-none py-2.5 px-4 custom-scrollbar type-body font-body min-w-0 placeholder:text-gray-500 transition-all duration-300 ease-out transform" 
                        placeholder={
                          props.editingMessageId
                            ? 'Edit message...'
                            : props.pendingFiles?.length > 0
                              ? 'Add a caption...'
                              : `Message ${props.view === 'home' ? '@' + props.activeDm?.profiles?.username : '#' + props.activeChannel?.name}`
                        }
                        value={props.editingMessageId ? props.editContent : undefined}
                        onChange={(e) => {
                          if (props.editingMessageId) props.setEditContent(e.target.value)
                          else props.handleTyping(e)
                        }}
                        onKeyDown={(e) => {
                          if (props.editingMessageId) {
                            if (e.key === 'Enter' && !e.shiftKey && enterSends()) {
                              e.preventDefault()
                              props.handleUpdateMessage(e, props.editingMessageId, { allowEmpty: true })
                            }
                            if (e.key === 'Escape') {
                              props.setEditingMessageId(null)
                              props.setEditContent('')
                            }
                            return
                          }

                          // Up on an empty composer edits your last text message, as in Slack/Discord.
                          if (e.key === 'ArrowUp' && !e.currentTarget.value && !props.replyingTo) {
                            const last = props.visibleMessages.findLast(m => m.profile_id === ownId && !String(m.id).startsWith('local-'))
                            if (last && !last.message_attachments?.length && !last.is_deleted && !last.is_unreadable) {
                              e.preventDefault()
                              props.setEditingMessageId(last.id)
                              props.setEditContent(last.content || '')
                            }
                            return
                          }

                          if (mentionCandidates.length > 0) {
                            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                              e.preventDefault()
                              const step = e.key === 'ArrowDown' ? 1 : mentionCandidates.length - 1
                              setMentionIndex((index) => (index + step) % mentionCandidates.length)
                              return
                            }
                            if (e.key === 'Enter' || e.key === 'Tab') {
                              e.preventDefault()
                              insertMention(mentionCandidates[mentionIndex] || mentionCandidates[0])
                              return
                            }
                            if (e.key === 'Escape') {
                              setMentionQuery(null)
                              return
                            }
                          }

                          if (e.key === 'Enter' && !e.shiftKey && enterSends()) {
                            e.preventDefault()
                            props.handleSendMessage(e)
                            syncComposer()
                          }
                        }} 
                        rows={1} 
                        style={{ minHeight: '44px' }} 
                      />
                      <div className="flex items-center justify-center h-[44px] w-[44px] shrink-0">
                        {/* The glyph is a smiley — it already draws a circle. A
                            button border here reads as a doubled outline, so this
                            one control goes borderless. */}
                        <button
                          type="button"
                          onClick={toggleEmojiPicker}
                          onTouchStartCapture={() => { blurComposer(); }}
                          disabled={props.isUploading}
                          style={{ borderColor: 'transparent' }}
                          className={`w-[44px] h-[44px] flex items-center justify-center rounded-full transition-colors cursor-pointer ${showInputEmojiPicker ? 'bg-[var(--chat-control-bg)] text-[var(--chat-control-text)]' : 'premium-icon-button'}`}
                          title="Emoji and effects"
                          aria-label="Emoji and effects"
                          aria-expanded={showInputEmojiPicker}
                        >
                          <SmilePlus size={20} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    {props.keyboardImageFallbackMessage && (
                      <p className="px-4 pt-1 type-meta font-medium text-amber-300/90">
                        {props.keyboardImageFallbackMessage}
                      </p>
                    )}
                    </div>
                    {/* One button: send when there is something to send, record
                        otherwise. Holding it opens how-to-send instead, which is
                        where the spoiler toggle now lives. */}
                    {/* touch-none: an upward drag here is the spoiler gesture, not a
                        scroll — let the browser claim it and it fires pointercancel
                        mid-swipe. */}
                    <div ref={sendOptionsRef} className="relative shrink-0 touch-none" {...sendGesture}>
                      {/* The wedges sit on an arc up and to the left: the drag never
                          runs into the screen edge, and the thumb never covers the
                          option it is sitting on. Pointer events stay off them —
                          the press is captured on the wrapper and hit-tests by
                          angle, so a wedge only has to draw itself. */}
                      {radialOpen && (
                        <div className="pointer-events-none absolute left-1/2 top-1/2 z-50" aria-hidden="true">
                          {SEND_RADIAL_OPTIONS.map((option, index) => (
                            <div
                              key={option.id}
                              style={{
                                left: `${Math.cos(option.angle * Math.PI / 180) * SEND_RADIAL_PX}px`,
                                top: `${-Math.sin(option.angle * Math.PI / 180) * SEND_RADIAL_PX}px`
                              }}
                              className={`absolute flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-0.5 rounded-full border shadow-lg transition-transform duration-150 ${radialIndex === index ? 'scale-110 border-[var(--accent-bright)] bg-[var(--app-accent)] text-[var(--accent-contrast)]' : 'border-[var(--chat-control-border)] bg-[var(--bg-element)] text-[var(--text-muted)]'}`}
                            >
                              {option.spoiler
                                ? <EyeOff size={16} aria-hidden="true" />
                                : <Timer size={16} aria-hidden="true" />}
                              {/* An unselected timed wedge shows where its cycle
                                  starts; the selected one counts on from there. */}
                              {option.timed
                                ? <span className="type-meta font-black leading-none">{radialDuration(option, radialIndex === index ? radialStep : 0).id}</span>
                                : null}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* The menu is the tap-driven half of the same control: it
                          keeps the persistent toggles and the lifetimes the three
                          wedges have no room for. */}
                      {sendOptionsOpen && (
                        <div className="premium-menu absolute bottom-full right-0 mb-3 z-50 flex max-h-[70vh] w-[9rem] flex-col gap-1 overflow-y-auto rounded-xl p-1.5 animate-slide-up origin-bottom-right" role="menu" aria-label="Send options">
                          <button
                            type="button"
                            data-no-long-press
                            onClick={() => props.setComposerSpoiler(!props.composerSpoiler)}
                            disabled={Boolean(props.editingMessageId)}
                            className={`flex items-center gap-2 rounded-lg px-2.5 py-2 type-label font-medium transition-colors hover:bg-[var(--bg-element)] disabled:opacity-40 ${props.composerSpoiler ? 'bg-amber-500/20 text-amber-200' : 'text-[var(--text-main)]'}`}
                            role="menuitemcheckbox"
                            aria-checked={Boolean(props.composerSpoiler)}
                          >
                            <EyeOff size={16} className={props.composerSpoiler ? 'text-amber-300' : 'text-amber-400/70'} aria-hidden="true" />
                            <span className="flex-1 text-left">Spoiler</span>
                            {props.composerSpoiler && <Check size={16} className="text-amber-300" aria-hidden="true" />}
                          </button>

                          {/* One chip per row, tight padding: the menu is narrow now
                              that the swipe hint is gone. */}
                          <div className="flex flex-col gap-0.5 px-1 pb-0.5" role="group" aria-label="Disappearing">
                            <Timer size={14} className="mx-auto text-[var(--text-muted)]" aria-hidden="true" />
                            {DISAPPEARING_OPTIONS.map(option => (
                              <button
                                key={option.id}
                                type="button"
                                data-no-long-press
                                onClick={() => props.setComposerExpirySeconds(option.seconds)}
                                className={`w-full rounded-md py-1 text-center type-meta font-bold uppercase tracking-wide transition-colors ${(props.composerExpirySeconds || null) === option.seconds ? 'bg-[var(--bg-element)] text-[var(--text-main)] ring-1 ring-inset ring-[var(--theme-base)]' : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                                role="menuitemradio"
                                aria-checked={(props.composerExpirySeconds || null) === option.seconds}
                                aria-label={option.seconds ? `Disappear after ${option.label}` : 'Do not disappear'}
                              >
                                {option.id}
                              </button>
                            ))}
                          </div>

                        </div>
                      )}

                      <button
                        type={sendIsVoice ? 'button' : 'submit'}
                        onClick={sendIsVoice ? (e) => { e.preventDefault(); e.stopPropagation(); startVoiceRecording(); } : undefined}
                        /* The radial is a drag, so a keyboard has no way onto it.
                           Arrow-up opens the menu instead — the same half of the
                           control a mouse gets — and Escape closes it. */
                        onKeyDown={(e) => {
                          if (e.key === 'Escape' && sendOptionsOpen) { setSendOptionsOpen(false); return }
                          if (sendIsVoice) return
                          if (e.key === 'ArrowUp' || e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                            e.preventDefault()
                            setSendOptionsOpen(open => !open)
                          }
                        }}
                        aria-haspopup="menu"
                        aria-expanded={sendIsVoice ? undefined : sendOptionsOpen}
                        disabled={props.isUploading}
                        className={`relative flex h-[44px] w-[44px] cursor-pointer items-center justify-center rounded-full border transition-all duration-150 hover:brightness-110 disabled:opacity-50 ${radialChoice
                          ? 'border-[var(--accent-bright)] bg-[var(--app-accent-20)] text-[var(--accent-bright)] shadow-[0_0_0_5px_var(--app-accent-20)]'
                          /* The palette already answers "what goes on an accent
                             fill": mono says a black pill with a white glyph,
                             the colour themes say an accent pill with a dark
                             one. Filling with --theme-base and labelling in
                             white is what painted white on white in mono. */
                          : 'border-[var(--chat-control-border)] bg-[var(--chat-control-bg)] text-[var(--chat-control-text)]'}`}
                        style={{ transform: `scale(${radialChoice ? 1.12 : 1})` }}
                        aria-label={sendIsVoice ? 'Record a voice message. Tap to record hands-free, or hold and drag up to lock, any other direction to discard' : 'Send message. Press arrow up, or hold and drag, for send options: spoiler and disappearing messages'}
                        title={sendIsVoice ? 'Tap to record · hold to talk, drag up to lock, away to discard' : 'Send · hold for options, drag onto one to send'}
                      >
                        {sendIsVoice && <Mic size={18} aria-hidden="true" />}
                        {/* Armed: the icon says what releasing will do. */}
                        {!sendIsVoice && radialChoice && (radialChoice.spoiler
                          ? <EyeOff size={18} aria-hidden="true" />
                          : <Timer size={18} aria-hidden="true" />)}
                        {!sendIsVoice && !radialChoice && <Send size={18} className="translate-x-[-1px] translate-y-[1px]" aria-hidden="true" />}
                        {Boolean(props.composerExpirySeconds) && (
                          <span className="absolute -bottom-1 -right-1 rounded-full border border-[var(--chat-control-border)] bg-[var(--chat-control-bg)] px-1 type-meta font-black leading-tight text-[var(--chat-control-text)]" aria-hidden="true">
                            {describeExpiry(props.composerExpirySeconds)}
                          </span>
                        )}
                      </button>
                    </div>
                  </form>
                  {showPollComposer && props.activeChannel?.id && (
                    <PollComposer channelId={props.activeChannel.id} onClose={() => setShowPollComposer(false)} />
                  )}
                  {showInputEmojiPicker && (
                    <Suspense fallback={<div className="mt-2 h-[45dvh] max-h-[26rem] min-h-[16rem]" />}>
                      {/* Focusing the composer already closes the drawer. */}
                      <div onKeyDown={(e) => { if (e.key === 'Escape') props.messageInputRef.current?.focus() }}>
                      <ComposerDrawer
                        tab={composerDrawerTab}
                        onTabChange={setComposerDrawerTab}
                        onEmojiSelect={handleEmojiSelect}
                        onWordEffect={sendWithWordEffect}
                        composerEffect={props.composerEffect}
                        onComposerEffect={props.setComposerEffect}
                        sendEffectsDisabled={Boolean(props.editingMessageId)}
                      />
                      </div>
                    </Suspense>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      )}
      </section>
      {/* A main-level sibling so it can dock as its own column from xl up. */}
      {openThreadId && props.view === 'server' && props.activeChannel?.id && (
        <Suspense fallback={null}>
          <ThreadPanel
            root={validMessagesById.get(openThreadId)}
            channelId={props.activeChannel.id}
            currentUserId={props.session.user.id}
            onClose={() => setOpenThreadId(null)}
          />
        </Suspense>
      )}
      {mediaEditorTarget && (
        <Suspense fallback={null}>
          <MediaEditorModal
            file={mediaEditorTarget.file}
            title={mediaEditorTarget.type === 'video' ? 'Crop video' : 'Edit image'}
            onCancel={() => setMediaEditorTarget(null)}
            onSave={savePendingMediaEdit}
          />
        </Suspense>
      )}
      <ScreenEffect />
    </main>
  )
}
