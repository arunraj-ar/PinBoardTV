package com.pinboardtv.app;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.service.dreams.DreamService;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class PinBoardDreamService extends DreamService {

    private WebView mWebView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    public void onAttachedToWindow() {
        super.onAttachedToWindow();

        // Allow remote interaction (ArrowLeft/ArrowRight to flip screensaver pages, Enter to wake)
        setInteractive(true);
        setFullscreen(true);
        setScreenBright(true);

        mWebView = new WebView(this);
        setContentView(mWebView);

        configureWebSettings();

        // Load ambient screensaver route
        String screensaverUrl = getString(R.string.tv_screensaver_url);
        mWebView.loadUrl(screensaverUrl);
    }

    private void configureWebSettings() {
        WebSettings settings = mWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);

        mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // If user clicks / navigates to main app (/tv), launch MainActivity
                if (url.contains("/tv") && !url.contains("/tv/screensaver")) {
                    launchMainActivity();
                    return true;
                }
                view.loadUrl(url);
                return true;
            }
        });

        mWebView.setWebChromeClient(new WebChromeClient());
        mWebView.requestFocus();
    }

    private void launchMainActivity() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(intent);
        wakeUp(); // Dismiss screensaver
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        // If Enter/Select is pressed on the launch button, launch the full interactive app
        if (event.getKeyCode() == KeyEvent.KEYCODE_DPAD_CENTER || event.getKeyCode() == KeyEvent.KEYCODE_ENTER) {
            launchMainActivity();
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    public void onDreamingStarted() {
        super.onDreamingStarted();
        if (mWebView != null) {
            mWebView.onResume();
        }
    }

    @Override
    public void onDreamingStopped() {
        if (mWebView != null) {
            mWebView.onPause();
        }
        super.onDreamingStopped();
    }

    @Override
    public void onDetachedFromWindow() {
        if (mWebView != null) {
            mWebView.destroy();
        }
        super.onDetachedFromWindow();
    }
}
