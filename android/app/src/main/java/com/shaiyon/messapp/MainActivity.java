package com.shaiyon.messapp;

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
