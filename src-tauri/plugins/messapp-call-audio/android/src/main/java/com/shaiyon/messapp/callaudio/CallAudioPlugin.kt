package com.shaiyon.messapp.callaudio

import android.Manifest
import android.app.Activity
import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.util.Log
import app.tauri.PermissionState
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

private const val TAG = "CALL_AUDIO_DEBUG"
private const val MIC = "microphone"
private const val CAMERA = "camera"

@InvokeArg
class SpeakerArgs {
  var enabled: Boolean = false
}

/**
 * Port of the Capacitor CallAudioPlugin: owns Android communication mode and
 * speaker or earpiece routing during WebRTC calls. The pre-call AudioManager
 * state is restored at endCall so routing does not leak after a call.
 */
@TauriPlugin(
  permissions = [
    Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = MIC),
    Permission(strings = [Manifest.permission.CAMERA], alias = CAMERA)
  ]
)
class CallAudioPlugin(private val activity: Activity) : Plugin(activity) {
  private val audioManager = activity.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private var speakerEnabled = false
  private var callStarted = false
  private var previousMode = AudioManager.MODE_NORMAL
  private var previousSpeakerphone = false
  private var previousBluetoothSco = false

  @Command
  fun startCall(invoke: Invoke) {
    beginCommunicationMode(false)
    invoke.resolve(stateResult())
  }

  @Command
  fun setSpeakerEnabled(invoke: Invoke) {
    beginCommunicationMode(invoke.parseArgs(SpeakerArgs::class.java).enabled)
    invoke.resolve(stateResult())
  }

  @Command
  fun getSpeakerState(invoke: Invoke) {
    invoke.resolve(stateResult())
  }

  @Command
  fun endCall(invoke: Invoke) {
    restoreNormalAudio()
    invoke.resolve(JSObject().put("enabled", false))
  }

  @Command
  fun checkMediaPermissions(invoke: Invoke) {
    invoke.resolve(permissionResult())
  }

  @Command
  fun requestMicrophonePermission(invoke: Invoke) {
    if (getPermissionState(MIC) == PermissionState.GRANTED) {
      invoke.resolve(permissionResult())
    } else {
      requestPermissionForAlias(MIC, invoke, "microphonePermissionCallback")
    }
  }

  @PermissionCallback
  private fun microphonePermissionCallback(invoke: Invoke) {
    invoke.resolve(permissionResult())
  }

  private fun permissionResult() = JSObject()
    .put(MIC, getPermissionState(MIC).toString())
    .put(CAMERA, getPermissionState(CAMERA).toString())

  @Suppress("DEPRECATION")
  private fun beginCommunicationMode(speaker: Boolean) {
    if (!callStarted) {
      previousMode = audioManager.mode
      previousSpeakerphone = audioManager.isSpeakerphoneOn
      previousBluetoothSco = audioManager.isBluetoothScoOn
      callStarted = true
    }
    audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
    if (audioManager.isBluetoothScoOn) audioManager.stopBluetoothSco()
    audioManager.isBluetoothScoOn = false

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val routed = routeCommunicationDevice(speaker)
      Log.d(TAG, "setCommunicationDevice speaker=$speaker success=$routed selected=${describe(audioManager.communicationDevice)}")
    }
    audioManager.isSpeakerphoneOn = speaker
    speakerEnabled = isSpeakerRouteActive()
  }

  @Suppress("DEPRECATION")
  private fun restoreNormalAudio() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) audioManager.clearCommunicationDevice()
    audioManager.isSpeakerphoneOn = previousSpeakerphone
    if (!previousBluetoothSco && audioManager.isBluetoothScoOn) audioManager.stopBluetoothSco()
    audioManager.isBluetoothScoOn = previousBluetoothSco
    audioManager.mode = previousMode
    speakerEnabled = false
    callStarted = false
  }

  private fun routeCommunicationDevice(speaker: Boolean): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return false
    val devices = audioManager.availableCommunicationDevices
    val wanted = if (speaker) AudioDeviceInfo.TYPE_BUILTIN_SPEAKER else AudioDeviceInfo.TYPE_BUILTIN_EARPIECE
    // Earpiece missing (tablets): any non-speaker device, else whatever is first.
    val target = devices.firstOrNull { it.type == wanted }
      ?: (if (!speaker) devices.firstOrNull { it.type != AudioDeviceInfo.TYPE_BUILTIN_SPEAKER } else null)
      ?: devices.firstOrNull()
      ?: return false
    return audioManager.setCommunicationDevice(target)
  }

  @Suppress("DEPRECATION")
  private fun isSpeakerRouteActive(): Boolean {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      audioManager.communicationDevice?.let { return it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
    }
    return audioManager.isSpeakerphoneOn
  }

  @Suppress("DEPRECATION")
  private fun stateResult(): JSObject {
    val selected = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) audioManager.communicationDevice else null
    return JSObject()
      .put("enabled", speakerEnabled)
      .put("mode", audioManager.mode)
      .put("speakerphoneOn", audioManager.isSpeakerphoneOn)
      .put("selectedCommunicationDevice", describe(selected))
  }

  private fun describe(device: AudioDeviceInfo?): String =
    if (device == null) "none" else "{id=${device.id},type=${device.type},name=${device.productName}}"
}
