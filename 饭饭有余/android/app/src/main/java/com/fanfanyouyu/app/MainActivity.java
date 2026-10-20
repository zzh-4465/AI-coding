package com.fanfanyouyu.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackupFilesPlugin.class);
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (getBridge() == null) { finish(); return; }
                getBridge().getWebView().evaluateJavascript(
                    "Boolean(window.fanfanGoBack && window.fanfanGoBack())",
                    handled -> { if (!"true".equals(handled)) finish(); }
                );
            }
        });
    }
}
