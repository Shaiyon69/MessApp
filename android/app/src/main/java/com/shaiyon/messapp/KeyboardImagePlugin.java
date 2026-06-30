package com.shaiyon.messapp;

import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.text.TextUtils;
import android.webkit.MimeTypeMap;

import androidx.core.view.inputmethod.InputConnectionCompat;
import androidx.core.view.inputmethod.InputContentInfoCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.lang.ref.WeakReference;
import java.util.Locale;

@CapacitorPlugin(name = "KeyboardImage")
public class KeyboardImagePlugin extends Plugin {
    public static final String EVENT_KEYBOARD_IMAGE_RECEIVED = "keyboardImageReceived";
    private static WeakReference<KeyboardImagePlugin> instanceRef = new WeakReference<>(null);

    @Override
    public void load() {
        instanceRef = new WeakReference<>(this);
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", true);
        ret.put("mimeTypes", MessAppWebView.COMMIT_CONTENT_MIME_TYPES);
        call.resolve(ret);
    }

    public static boolean handleCommitContent(Context context, InputContentInfoCompat inputContentInfo, int flags, Bundle opts) {
        KeyboardImagePlugin plugin = instanceRef.get();
        if (plugin == null) return false;
        return plugin.receiveCommittedContent(context, inputContentInfo, flags, opts);
    }

    private boolean receiveCommittedContent(Context context, InputContentInfoCompat inputContentInfo, int flags, Bundle opts) {
        Uri contentUri = inputContentInfo.getContentUri();
        String mimeType = resolveMimeType(context, contentUri, inputContentInfo);
        if (!isAcceptedImageType(mimeType)) return false;

        boolean permissionRequested = false;
        try {
            if ((flags & InputConnectionCompat.INPUT_CONTENT_GRANT_READ_URI_PERMISSION) != 0) {
                inputContentInfo.requestPermission();
                permissionRequested = true;
            }

            File copiedFile = copyContentToCache(context, contentUri, mimeType);
            JSObject payload = new JSObject();
            payload.put("filename", copiedFile.getName());
            payload.put("mimeType", mimeType);
            payload.put("path", copiedFile.getAbsolutePath());
            payload.put("uri", Uri.fromFile(copiedFile).toString());
            payload.put("size", copiedFile.length());
            notifyListeners(EVENT_KEYBOARD_IMAGE_RECEIVED, payload);
            return true;
        } catch (Exception ex) {
            notifyError(ex.getMessage());
            return false;
        } finally {
            if (permissionRequested) {
                try {
                    inputContentInfo.releasePermission();
                } catch (Exception ignored) {}
            }
        }
    }

    private void notifyError(String message) {
        JSObject payload = new JSObject();
        payload.put("message", message != null ? message : "Keyboard image could not be read");
        notifyListeners("keyboardImageError", payload);
    }

    private File copyContentToCache(Context context, Uri uri, String mimeType) throws Exception {
        File targetDir = new File(context.getCacheDir(), "keyboard_images");
        if (!targetDir.exists() && !targetDir.mkdirs()) {
            throw new IllegalStateException("Could not create keyboard image cache");
        }

        String displayName = sanitizeFilename(resolveDisplayName(context, uri));
        if (TextUtils.isEmpty(displayName)) {
            String extension = extensionForMimeType(mimeType);
            displayName = "keyboard-image-" + System.currentTimeMillis() + "." + extension;
        }

        File target = new File(targetDir, displayName);
        if (target.exists()) {
            String extension = extensionForMimeType(mimeType);
            String base = displayName.replaceFirst("\\.[^.]+$", "");
            target = new File(targetDir, base + "-" + System.currentTimeMillis() + "." + extension);
        }

        try (InputStream input = context.getContentResolver().openInputStream(uri);
             FileOutputStream output = new FileOutputStream(target)) {
            if (input == null) throw new IllegalStateException("Keyboard content stream was empty");
            byte[] buffer = new byte[8192];
            int bytesRead;
            while ((bytesRead = input.read(buffer)) != -1) {
                output.write(buffer, 0, bytesRead);
            }
        }

        return target;
    }

    private String resolveDisplayName(Context context, Uri uri) {
        try (Cursor cursor = context.getContentResolver().query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) return cursor.getString(index);
            }
        } catch (Exception ignored) {}
        return null;
    }

    private String sanitizeFilename(String value) {
        if (value == null) return null;
        String sanitized = value.replaceAll("[^A-Za-z0-9._-]", "_");
        return sanitized.length() > 160 ? sanitized.substring(sanitized.length() - 160) : sanitized;
    }

    private String resolveMimeType(Context context, Uri uri, InputContentInfoCompat inputContentInfo) {
        String type = context.getContentResolver().getType(uri);
        if (!TextUtils.isEmpty(type)) return type.toLowerCase(Locale.US);
        if (inputContentInfo.getDescription().getMimeTypeCount() > 0) {
            return inputContentInfo.getDescription().getMimeType(0).toLowerCase(Locale.US);
        }
        return "application/octet-stream";
    }

    private boolean isAcceptedImageType(String mimeType) {
        for (String accepted : MessAppWebView.COMMIT_CONTENT_MIME_TYPES) {
            if (accepted.equalsIgnoreCase(mimeType)) return true;
        }
        return false;
    }

    private String extensionForMimeType(String mimeType) {
        String extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType);
        return !TextUtils.isEmpty(extension) ? extension : "bin";
    }
}
