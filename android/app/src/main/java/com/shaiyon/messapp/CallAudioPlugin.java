package com.shaiyon.messapp;

/**
 * Owns Android communication-mode and speaker routing during WebRTC calls. The
 * pre-call AudioManager state is restored so routing does not leak after calls.
 */

import android.content.Context;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;

@CapacitorPlugin(name = "CallAudio")
public class CallAudioPlugin extends Plugin {
    private static final String TAG = "CALL_AUDIO_DEBUG";
    private AudioManager audioManager;
    private boolean speakerEnabled = false;
    private boolean callStarted = false;
    private int previousMode = AudioManager.MODE_NORMAL;
    private boolean previousSpeakerphone = false;
    private boolean previousBluetoothSco = false;

    @Override
    public void load() {
        audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
    }

    @PluginMethod
    public void startCall(PluginCall call) {
        if (audioManager == null) {
            call.reject("AudioManager is unavailable");
            return;
        }

        Log.d(TAG, "startCall modeBefore=" + audioManager.getMode() + " speakerBefore=" + audioManager.isSpeakerphoneOn());
        beginCommunicationMode(false);
        JSObject ret = buildStateResult();
        call.resolve(ret);
    }

    @PluginMethod
    public void setSpeakerEnabled(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        if (audioManager == null) {
            call.reject("AudioManager is unavailable");
            return;
        }

        Log.d(TAG, "setSpeakerEnabled requested=" + enabled + " modeBefore=" + audioManager.getMode() + " speakerBefore=" + audioManager.isSpeakerphoneOn());
        beginCommunicationMode(enabled);
        JSObject ret = buildStateResult();
        call.resolve(ret);
    }

    @PluginMethod
    public void getSpeakerState(PluginCall call) {
        JSObject ret = audioManager != null ? buildStateResult() : new JSObject();
        if (audioManager == null) ret.put("enabled", speakerEnabled);
        call.resolve(ret);
    }

    @PluginMethod
    public void endCall(PluginCall call) {
        restoreNormalAudio();
        JSObject ret = new JSObject();
        ret.put("enabled", false);
        call.resolve(ret);
    }

    private void restoreNormalAudio() {
        if (audioManager == null) return;
        Log.d(TAG, "restoreNormalAudio modeBefore=" + audioManager.getMode() + " speakerBefore=" + audioManager.isSpeakerphoneOn());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            audioManager.clearCommunicationDevice();
            Log.d(TAG, "clearCommunicationDevice called during restore selected=" + describeDevice(audioManager.getCommunicationDevice()));
        }
        audioManager.setSpeakerphoneOn(previousSpeakerphone);
        if (!previousBluetoothSco && audioManager.isBluetoothScoOn()) {
            audioManager.stopBluetoothSco();
        }
        audioManager.setBluetoothScoOn(previousBluetoothSco);
        audioManager.setMode(previousMode);
        speakerEnabled = false;
        callStarted = false;
        Log.d(TAG, "restoreNormalAudio modeAfter=" + audioManager.getMode() + " speakerAfter=" + audioManager.isSpeakerphoneOn());
    }

    private void beginCommunicationMode(boolean speaker) {
        if (!callStarted) {
            previousMode = audioManager.getMode();
            previousSpeakerphone = audioManager.isSpeakerphoneOn();
            previousBluetoothSco = audioManager.isBluetoothScoOn();
            callStarted = true;
        }
        audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
        if (audioManager.isBluetoothScoOn()) {
            audioManager.stopBluetoothSco();
        }
        audioManager.setBluetoothScoOn(false);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            boolean routed = routeCommunicationDevice(speaker);
            Log.d(TAG, "setCommunicationDevice requestedSpeaker=" + speaker + " success=" + routed + " selected=" + describeDevice(audioManager.getCommunicationDevice()));
        }
        audioManager.setSpeakerphoneOn(speaker);
        speakerEnabled = isSpeakerRouteActive();
        Log.d(TAG, "beginCommunicationMode modeAfter=" + audioManager.getMode() + " speakerAfter=" + audioManager.isSpeakerphoneOn() + " selected=" + describeDevice(getSelectedCommunicationDeviceSafe()) + " enabled=" + speakerEnabled);
    }

    private boolean routeCommunicationDevice(boolean speaker) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return false;
        List<AudioDeviceInfo> devices = audioManager.getAvailableCommunicationDevices();
        StringBuilder available = new StringBuilder();
        AudioDeviceInfo fallback = null;
        AudioDeviceInfo target = null;
        for (AudioDeviceInfo device : devices) {
            available.append(describeDevice(device)).append(";");
            if (fallback == null) fallback = device;
            if (speaker && device.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) target = device;
            if (!speaker && device.getType() == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE) target = device;
        }
        if (target == null && !speaker) {
            for (AudioDeviceInfo device : devices) {
                if (device.getType() != AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) {
                    target = device;
                    break;
                }
            }
        }
        if (target == null) target = fallback;
        Log.d(TAG, "availableCommunicationDevices=" + available + " target=" + describeDevice(target));
        if (target == null) return false;
        return audioManager.setCommunicationDevice(target);
    }

    private boolean isSpeakerRouteActive() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AudioDeviceInfo selected = audioManager.getCommunicationDevice();
            if (selected != null) return selected.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER;
        }
        return audioManager.isSpeakerphoneOn();
    }

    private AudioDeviceInfo getSelectedCommunicationDeviceSafe() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) return audioManager.getCommunicationDevice();
        return null;
    }

    private JSObject buildStateResult() {
        JSObject ret = new JSObject();
        ret.put("enabled", speakerEnabled);
        ret.put("mode", audioManager.getMode());
        ret.put("speakerphoneOn", audioManager.isSpeakerphoneOn());
        ret.put("selectedCommunicationDevice", describeDevice(getSelectedCommunicationDeviceSafe()));
        return ret;
    }

    private String describeDevice(AudioDeviceInfo device) {
        if (device == null) return "none";
        return "{id=" + device.getId() + ",type=" + device.getType() + ",name=" + device.getProductName() + "}";
    }
}
