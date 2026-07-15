package com.shaiyon.messapp;

/**
 * Capacitor entry point. Registers authored audio and keyboard-image bridges
 * before BridgeActivity creates the WebView.
 */

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CallAudioPlugin.class);
        registerPlugin(KeyboardImagePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
