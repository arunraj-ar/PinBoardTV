package com.pinboardtv.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognizerIntent;
import android.text.InputType;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.Display;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import java.util.ArrayList;
import org.json.JSONObject;

public class MainActivity extends Activity {

    private static final String TAG = "PinBoardTV";
    private static final int REQUEST_CODE_VOICE = 1001;
    private WebView mWebView;
    private int mScreenWidth = 1920;
    private int mScreenHeight = 1080;
    private float mDensity = 1.0f;
    private int mDensityDpi = 160;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        try {
            // Keep TV screen awake while viewing ambient board
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                getWindow().getAttributes().layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            }

            // Analyze physical TV resolution and density
            analyzeDisplayMetrics();

            mWebView = new WebView(this);
            setContentView(mWebView);

            configureWebSettings();

            // Load the hosted TV board
            String appUrl = getString(R.string.tv_app_url);
            Log.i(TAG, "Loading PinBoardTV URL: " + appUrl);
            mWebView.loadUrl(appUrl);
        } catch (Exception e) {
            Log.e(TAG, "Error in onCreate", e);
        }
    }

    private void analyzeDisplayMetrics() {
        try {
            DisplayMetrics metrics = new DisplayMetrics();
            Display display = getWindowManager().getDefaultDisplay();
            display.getRealMetrics(metrics);

            mScreenWidth = metrics.widthPixels;
            mScreenHeight = metrics.heightPixels;
            mDensity = metrics.density;
            mDensityDpi = metrics.densityDpi;

            Log.i(TAG, String.format(
                "TV Display Analysis: Physical=%dx%d, Density=%.2f, DPI=%d",
                mScreenWidth, mScreenHeight, mDensity, mDensityDpi
            ));
        } catch (Exception e) {
            Log.w(TAG, "Could not query real display metrics, using defaults", e);
        }
    }

    private void configureWebSettings() {
        try {
            WebSettings settings = mWebView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setLoadWithOverviewMode(true);
            settings.setUseWideViewPort(true);
            settings.setTextZoom(100);

            // Hardware layer for 60fps TV rendering
            mWebView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

            // Native TV Scale Calculation:
            // TV displays (e.g. density=2.0 on a 1080p screen) shrink the CSS viewport
            // to 960x540, which blows up UI elements 200% and cuts off the bottom.
            // By setting initial scale to (94% / density), we map the canvas to true 1080p
            // with a 3% safe overscan margin so no bezel ever cuts off content across the entire UI.
            int targetScale = (int) (94.0f / Math.max(1.0f, mDensity));
            mWebView.setInitialScale(targetScale);

            Log.i(TAG, String.format(
                "Configured TV Scale: density=%.2f -> initialScale=%d%%",
                mDensity, targetScale
            ));

            // Expose TV metrics to web application
            mWebView.addJavascriptInterface(new TVMetricsBridge(), "AndroidTVBridge");

            mWebView.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    super.onPageFinished(view, url);
                    applyTvAdaptiveScaling(view);
                }

                @Override
                public boolean shouldOverrideUrlLoading(WebView view, String url) {
                    view.loadUrl(url);
                    return true;
                }
            });

            mWebView.setWebChromeClient(new WebChromeClient());
            mWebView.setFocusable(true);
            mWebView.setFocusableInTouchMode(true);
            mWebView.requestFocus();
        } catch (Exception e) {
            Log.e(TAG, "Error configuring web settings", e);
        }
    }

    private void applyTvAdaptiveScaling(WebView view) {
        try {
            // Adaptive TV Scaling:
            // High-DPI TV displays (e.g. density=2.0 on a 1080p screen) shrink the CSS viewport
            // to 960x540, which blows up UI elements 200% and cuts off bottoms.
            // This script measures the viewport and scales it smoothly to fit the TV screen without clipping.
            String script = "(function() {" +
                "  var meta = document.querySelector('meta[name=\"viewport\"]');" +
                "  if (!meta) {" +
                "    meta = document.createElement('meta');" +
                "    meta.name = 'viewport';" +
                "    document.head.appendChild(meta);" +
                "  }" +
                "  var screenW = window.innerWidth || " + mScreenWidth + ";" +
                "  var screenH = window.innerHeight || " + mScreenHeight + ";" +
                "  var targetW = 1920;" +
                "  var targetH = 1080;" +
                "  var scaleW = screenW / targetW;" +
                "  var scaleH = screenH / targetH;" +
                "  var fitScale = Math.min(scaleW, scaleH);" +
                "  if (fitScale > 0 && fitScale < 0.98) {" +
                "    meta.setAttribute('content', 'width=' + targetW + ', initial-scale=' + fitScale + ', maximum-scale=' + fitScale + ', user-scalable=no');" +
                "  }" +
                "  document.documentElement.style.overscrollBehavior = 'none';" +
                "  document.documentElement.style.overflow = 'hidden';" +
                "  document.body.style.overscrollBehavior = 'none';" +
                "  document.body.style.overflow = 'hidden';" +
                "})();";
            view.evaluateJavascript(script, null);
        } catch (Exception e) {
            Log.w(TAG, "Could not apply adaptive TV scaling", e);
        }
    }

    public class TVMetricsBridge {
        @JavascriptInterface
        public String getMetrics() {
            try {
                JSONObject obj = new JSONObject();
                obj.put("width", mScreenWidth);
                obj.put("height", mScreenHeight);
                obj.put("density", mDensity);
                obj.put("densityDpi", mDensityDpi);
                obj.put("isTvApp", true);
                return obj.toString();
            } catch (Exception e) {
                return "{}";
            }
        }

        @JavascriptInterface
        public void showKeyboard(final String currentText, final String title) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        AlertDialog.Builder builder = new AlertDialog.Builder(MainActivity.this, android.R.style.Theme_DeviceDefault_Dialog_Alert);
                        builder.setTitle(title != null && !title.isEmpty() ? title : "Set Household Name");

                        final EditText input = new EditText(MainActivity.this);
                        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS);
                        input.setText(currentText != null ? currentText : "");
                        input.setSelection(input.getText().length());
                        input.setTextSize(20);
                        input.setPadding(40, 30, 40, 30);
                        input.setImeOptions(EditorInfo.IME_ACTION_DONE);

                        builder.setView(input);

                        builder.setPositiveButton("Save", new DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(DialogInterface dialog, int which) {
                                String result = input.getText().toString().trim();
                                String script = "if (window.onNativeKeyboardInput) { window.onNativeKeyboardInput(" + JSONObject.quote(result) + "); }";
                                mWebView.evaluateJavascript(script, null);
                            }
                        });

                        builder.setNegativeButton("Cancel", new DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(DialogInterface dialog, int which) {
                                dialog.cancel();
                            }
                        });

                        AlertDialog dialog = builder.create();
                        dialog.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE | WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
                        dialog.show();
                        input.requestFocus();
                    } catch (Exception e) {
                        Log.e(TAG, "Failed to show TV keyboard dialog", e);
                    }
                }
            });
        }

        @JavascriptInterface
        public void requestVoiceInput(final String prompt) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                        intent.putExtra(RecognizerIntent.EXTRA_PROMPT, prompt != null ? prompt : "Speak into remote mic...");
                        startActivityForResult(intent, REQUEST_CODE_VOICE);
                    } catch (Exception e) {
                        Log.w(TAG, "Native speech recognizer intent failed, opening keyboard dialog with remote dictation", e);
                        showKeyboard("", "Speak into remote mic or type below:");
                    }
                }
            });
        }

        @JavascriptInterface
        public void exitApp() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Log.i(TAG, "Exit requested from TV UI");
                    finish();
                }
            });
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_CODE_VOICE && resultCode == RESULT_OK && data != null) {
            ArrayList<String> matches = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if (matches != null && !matches.isEmpty()) {
                String spokenText = matches.get(0);
                Log.i(TAG, "Voice input recognized from remote: " + spokenText);
                String script = "if (window.onNativeVoiceInput) { window.onNativeVoiceInput(" + JSONObject.quote(spokenText) + "); }";
                mWebView.evaluateJavascript(script, null);
            }
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        Log.i(TAG, "onNewIntent received: action=" + intent.getAction() + ", data=" + intent.getData());
        if (mWebView != null) {
            mWebView.evaluateJavascript(
                "if (window.dispatchEvent) { window.dispatchEvent(new CustomEvent('pinboard:wake', { detail: { action: 'OPEN_APP' } })); }",
                null
            );
            mWebView.requestFocus();
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enableImmersiveMode();
        }
    }

    private void enableImmersiveMode() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                final WindowInsetsController insetsController = getWindow().getInsetsController();
                if (insetsController != null) {
                    insetsController.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                    insetsController.setSystemBarsBehavior(
                        WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                    );
                }
            } else {
                getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                );
            }
        } catch (Exception e) {
            Log.w(TAG, "Could not set immersive mode", e);
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        // Intercept Fire TV Remote Back button
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (mWebView != null) {
                mWebView.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ESCAPE));
                mWebView.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ESCAPE));
                return true;
            }
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (mWebView != null) {
            mWebView.onResume();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (mWebView != null) {
            mWebView.onPause();
        }
    }

    @Override
    protected void onDestroy() {
        if (mWebView != null) {
            mWebView.destroy();
        }
        super.onDestroy();
    }
}
