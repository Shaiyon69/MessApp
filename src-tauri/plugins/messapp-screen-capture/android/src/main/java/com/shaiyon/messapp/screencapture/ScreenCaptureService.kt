package com.shaiyon.messapp.screencapture

import android.annotation.SuppressLint
import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.media.MediaFormat
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Process
import android.util.DisplayMetrics
import android.util.Log
import android.view.Display
import android.view.Surface
import androidx.core.app.NotificationCompat
import java.nio.ByteBuffer
import java.nio.ByteOrder

private const val TAG = "MessappScreenCapture"

/** Message types on the port; screenCapture.js reads the same 16-byte header. */
internal object Wire {
  const val VIDEO: Byte = 1
  const val AUDIO: Byte = 2
  const val HEADER = 16

  /** [type u8][flag u8][a u16][b u16][0 u16][timestampUs f64], little-endian, then the payload. */
  fun frame(type: Byte, flag: Int, a: Int, b: Int, timestampUs: Long, payload: ByteBuffer, size: Int): ByteArray {
    val out = ByteBuffer.allocate(HEADER + size).order(ByteOrder.LITTLE_ENDIAN)
    out.put(type).put(flag.toByte()).putShort(a.toShort()).putShort(b.toShort()).putShort(0).putDouble(timestampUs.toDouble())
    out.put(payload)
    return out.array()
  }
}

/** The two quality steps: 1080p60 when asked for and the encoder can, else 720p30. */
internal data class CaptureMode(val high: Boolean) {
  val longEdge get() = if (high) 1920 else 1280
  val shortEdge get() = if (high) 1080 else 720
  val frameRate get() = if (high) 60 else 30
  // Screen content compresses well; these match the sender caps set in screenCapture.js.
  val bitrate get() = if (high) 8_000_000 else 3_000_000

  /** The encode size for a screen of w x h: same orientation and aspect, within the box, even sides. */
  fun size(w: Int, h: Int): Pair<Int, Int> {
    val landscape = w >= h
    val (boxW, boxH) = if (landscape) longEdge to shortEdge else shortEdge to longEdge
    val scale = minOf(1f, boxW / w.toFloat(), boxH / h.toFloat())
    return (Math.round(w * scale) / 2 * 2).coerceAtLeast(2) to (Math.round(h * scale) / 2 * 2).coerceAtLeast(2)
  }

  companion object {
    fun pick(quality: String): CaptureMode {
      if (quality != "high") return CaptureMode(false)
      val high = CaptureMode(true)
      val supported = MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos.any { info ->
        info.isEncoder && info.supportedTypes.any { it.equals(MediaFormat.MIMETYPE_VIDEO_AVC, true) } &&
          info.getCapabilitiesForType(MediaFormat.MIMETYPE_VIDEO_AVC).videoCapabilities
            ?.areSizeAndRateSupported(high.shortEdge, high.longEdge, high.frameRate.toDouble()) == true
      }
      return CaptureMode(supported)
    }
  }
}

/**
 * Foreground MediaProjection service: the virtual display renders straight into a
 * hardware H.264 encoder's input surface (no per-frame copies), and playback capture
 * records other apps' audio. On rotation the encoder restarts at the new size, so
 * viewers get the new aspect instead of black bars.
 */
class ScreenCaptureService : Service() {
  companion object {
    const val ACTION_START = "com.shaiyon.messapp.screen_capture.START"
    const val ACTION_STOP = "com.shaiyon.messapp.screen_capture.STOP"
    const val EXTRA_RESULT_CODE = "resultCode"
    const val EXTRA_RESULT_DATA = "resultData"
    const val EXTRA_HIGH = "high"
    const val EXTRA_AUDIO = "audio"

    private const val CHANNEL_ID = "screen_sharing"
    private const val NOTIFICATION_ID = 4207
    private const val SAMPLE_RATE = 48_000
    private const val CHANNELS = 2
    private const val CHUNK_FRAMES = 960 // 20 ms

    @Volatile var current: ScreenCaptureService? = null
  }

  private var thread: HandlerThread? = null
  private var handler: Handler? = null
  private var projection: MediaProjection? = null
  private var virtualDisplay: VirtualDisplay? = null
  private var encoder: MediaCodec? = null
  private var mode = CaptureMode(false)
  private var width = 0
  private var height = 0
  private var audioRecord: AudioRecord? = null
  private var audioThread: Thread? = null
  @Volatile private var stopping = false

  private val displayListener = object : DisplayManager.DisplayListener {
    override fun onDisplayAdded(displayId: Int) {}
    override fun onDisplayRemoved(displayId: Int) {}
    override fun onDisplayChanged(displayId: Int) {
      if (displayId == Display.DEFAULT_DISPLAY) adaptToScreen()
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent == null) return START_NOT_STICKY
    if (intent.action == ACTION_STOP) {
      stopCapture()
      return START_NOT_STICKY
    }
    if (intent.action != ACTION_START || projection != null) return START_NOT_STICKY

    // Android 14 requires the foreground service to start before getMediaProjection.
    startForegroundNotice()
    val resultData: Intent? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent::class.java)
    } else {
      @Suppress("DEPRECATION") intent.getParcelableExtra(EXTRA_RESULT_DATA)
    }
    val manager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
    val proj = resultData?.let { manager.getMediaProjection(intent.getIntExtra(EXTRA_RESULT_CODE, Activity.RESULT_CANCELED), it) }
    if (proj == null) {
      stopCapture()
      return START_NOT_STICKY
    }
    projection = proj
    stopping = false
    current = this
    mode = CaptureMode(intent.getBooleanExtra(EXTRA_HIGH, false))

    val t = HandlerThread("MessAppScreenCapture").also { it.start() }
    thread = t
    val h = Handler(t.looper)
    handler = h
    proj.registerCallback(object : MediaProjection.Callback() {
      override fun onStop() = stopCapture()
    }, h)
    h.post {
      try {
        val (w, ht) = screenSize()
        val surface = startEncoder(w, ht)
        virtualDisplay = proj.createVirtualDisplay(
          "MessApp screen share", width, height, densityDpi(),
          DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, surface, null, h
        )
        (getSystemService(Context.DISPLAY_SERVICE) as DisplayManager).registerDisplayListener(displayListener, h)
      } catch (e: Exception) {
        Log.e(TAG, "screen capture failed to start", e)
        stopCapture()
      }
    }
    if (intent.getBooleanExtra(EXTRA_AUDIO, false) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startAudio(proj)
    return START_NOT_STICKY
  }

  fun requestKeyframe() {
    handler?.post { encoder?.setParameters(Bundle().apply { putInt(MediaCodec.PARAMETER_KEY_REQUEST_SYNC_FRAME, 0) }) }
  }

  private fun screenSize(): Pair<Int, Int> {
    val metrics = DisplayMetrics()
    @Suppress("DEPRECATION")
    (getSystemService(Context.DISPLAY_SERVICE) as DisplayManager).getDisplay(Display.DEFAULT_DISPLAY).getRealMetrics(metrics)
    return mode.size(maxOf(1, metrics.widthPixels), maxOf(1, metrics.heightPixels))
  }

  private fun densityDpi() = resources.displayMetrics.densityDpi

  /** Runs on the capture thread. Returns the new encoder's input surface. */
  private fun startEncoder(w: Int, h: Int): Surface {
    val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, w, h).apply {
      setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
      setInteger(MediaFormat.KEY_BIT_RATE, mode.bitrate)
      setInteger(MediaFormat.KEY_FRAME_RATE, mode.frameRate)
      setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 2)
      setInteger(MediaFormat.KEY_PRIORITY, 0) // realtime
      // A still screen produces no new frames; repeat the last one so viewers keep a live track.
      setLong(MediaFormat.KEY_REPEAT_PREVIOUS_FRAME_AFTER, 1_000_000L / mode.frameRate * 4)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) setInteger(MediaFormat.KEY_LOW_LATENCY, 1)
    }
    val codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
    var config: ByteArray? = null
    codec.setCallback(object : MediaCodec.Callback() {
      override fun onInputBufferAvailable(codec: MediaCodec, index: Int) {}
      override fun onOutputFormatChanged(codec: MediaCodec, format: MediaFormat) {}
      override fun onError(codec: MediaCodec, e: MediaCodec.CodecException) {
        Log.e(TAG, "encoder error", e)
      }

      override fun onOutputBufferAvailable(codec: MediaCodec, index: Int, info: MediaCodec.BufferInfo) {
        if (codec !== encoder) return
        val buffer = codec.getOutputBuffer(index)
        if (buffer != null && info.size > 0) {
          buffer.position(info.offset).limit(info.offset + info.size)
          if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) {
            config = ByteArray(info.size).also { buffer.get(it) }
          } else {
            val key = info.flags and MediaCodec.BUFFER_FLAG_KEY_FRAME != 0
            // Annex B with SPS/PPS before each keyframe, so the page can (re)start its decoder on any key.
            val payload = if (key && config != null) ByteBuffer.allocate(config!!.size + info.size).put(config!!).put(buffer).also { it.flip() } else buffer
            ScreenCapturePlugin.send(Wire.frame(Wire.VIDEO, if (key) 1 else 0, width, height, info.presentationTimeUs, payload, payload.remaining()))
          }
        }
        codec.releaseOutputBuffer(index, false)
      }
    }, handler)
    codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
    val surface = codec.createInputSurface()
    codec.start()
    encoder = codec
    width = w
    height = h
    return surface
  }

  /** On rotation: a new encoder at the new size, and the virtual display resized onto it. */
  private fun adaptToScreen() {
    val display = virtualDisplay ?: return
    val (w, h) = screenSize()
    if (w == width && h == height) return
    val old = encoder
    try {
      val surface = startEncoder(w, h)
      display.resize(w, h, densityDpi())
      display.surface = surface
    } catch (e: Exception) {
      Log.e(TAG, "encoder restart after rotation failed", e)
      stopCapture()
    } finally {
      old?.let { runCatching { it.stop() }; it.release() }
    }
  }

  @SuppressLint("MissingPermission") // the plugin starts audio only once RECORD_AUDIO is granted
  private fun startAudio(proj: MediaProjection) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
    try {
      val config = AudioPlaybackCaptureConfiguration.Builder(proj)
        .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
        .addMatchingUsage(AudioAttributes.USAGE_GAME)
        .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
        // MessApp's own playback (the other side's voice, call sounds) would echo back.
        .excludeUid(Process.myUid())
        .build()
      val format = AudioFormat.Builder()
        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
        .setSampleRate(SAMPLE_RATE)
        .setChannelMask(AudioFormat.CHANNEL_IN_STEREO)
        .build()
      val chunkBytes = CHUNK_FRAMES * CHANNELS * 2
      val record = AudioRecord.Builder()
        .setAudioFormat(format)
        .setBufferSizeInBytes(maxOf(chunkBytes * 4, AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_STEREO, AudioFormat.ENCODING_PCM_16BIT)))
        .setAudioPlaybackCaptureConfig(config)
        .build()
      audioRecord = record
      record.startRecording()
      audioThread = Thread({
        val pcm = ByteBuffer.allocateDirect(chunkBytes).order(ByteOrder.LITTLE_ENDIAN)
        while (!stopping) {
          pcm.clear()
          val read = record.read(pcm, chunkBytes, AudioRecord.READ_BLOCKING)
          if (read <= 0) continue
          pcm.limit(read)
          ScreenCapturePlugin.send(Wire.frame(Wire.AUDIO, CHANNELS, SAMPLE_RATE, 0, System.nanoTime() / 1000, pcm, read))
        }
      }, "MessAppScreenAudio").also { it.start() }
    } catch (e: Exception) {
      // The share goes on without sound rather than failing.
      Log.w(TAG, "playback capture unavailable", e)
    }
  }

  private fun startForegroundNotice() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(CHANNEL_ID, "Screen sharing", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Shown while MessApp shares your screen"
        setSound(null, null)
      }
      getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
    val notification = NotificationCompat.Builder(this, CHANNEL_ID)
      // The library has no icon of its own; the app's launcher icon stands in, as in the Capacitor build.
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("Sharing your screen")
      .setContentText("MessApp screen sharing is active")
      .setOngoing(true)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun stopCapture() {
    if (stopping) return
    stopping = true
    current = null
    runCatching { (getSystemService(Context.DISPLAY_SERVICE) as DisplayManager).unregisterDisplayListener(displayListener) }
    audioRecord?.let { runCatching { it.stop() }; it.release() }
    audioRecord = null
    audioThread = null
    val h = handler
    val release = {
      virtualDisplay?.release()
      virtualDisplay = null
      encoder?.let { runCatching { it.stop() }; it.release() }
      encoder = null
      projection?.stop()
      projection = null
      thread?.quitSafely()
      thread = null
      handler = null
    }
    // The encoder belongs to the capture thread; release it there, after any queued output.
    if (h != null) h.post(release) else release()
    @Suppress("DEPRECATION")
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE) else stopForeground(true)
    stopSelf()
    ScreenCapturePlugin.emitStopped()
  }

  override fun onDestroy() {
    stopCapture()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null
}
