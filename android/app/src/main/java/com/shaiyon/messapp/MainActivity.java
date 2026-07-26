package com.shaiyon.messapp;

/**
 * Capacitor entry point. Registers authored audio and keyboard-image bridges
 * before BridgeActivity creates the WebView.
 */

import android.os.Bundle;
import android.view.MotionEvent;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CallAudioPlugin.class);
        registerPlugin(KeyboardImagePlugin.class);
        registerPlugin(NativeMiniPlayerDragPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent event) {
        NativeMiniPlayerDragPlugin.onActivityTouchEvent(event);
        return super.dispatchTouchEvent(event);
    }
}
