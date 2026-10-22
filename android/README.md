# PinBoardTV — Fire TV Android Leanback APK & Screensaver

This directory contains the native **Fire OS Android Wrapper** for PinBoardTV, designed specifically for Amazon Fire TV Sticks, Fire TV Cubes, and Fire TV Edition Smart TVs.

---

## 📺 Key Capabilities

1. **Fire TV Leanback Launcher (`MainActivity.java`):**
   - Full 1080p widescreen landscape orientation without action bars or letterboxing.
   - Hardware-accelerated Chromium WebView loading the production hosted `/tv` app.
   - Spatial D-pad remote mapping (`KEYCODE_DPAD_CENTER`, `KEYCODE_ENTER`, `KEYCODE_BACK`).
   - Keeps TV display awake while the family is viewing the board.

2. **Fire TV Native Screensaver (`PinBoardDreamService.java`):**
   - Implements Android `DreamService` (`android.service.dreams.DreamService`).
   - Automatically appears inside Fire TV System Settings:
     **Settings > Display & Sounds > Screensaver > Current Screensaver > PinBoardTV Ambient Screensaver**.
   - Displays the 30-second automated multi-page slideshow with subtle card tilt.
   - Pressing `[SELECT]` or the Down-Arrow wake button smoothly dismisses the screensaver and launches the full interactive `MainActivity`.

---

## 🛠️ Building & Installing the APK

### Prerequisites
- Android Studio or Android SDK Command-line Tools (`build-tools 34+`).

### Step 1: Set Hosted Production URL
In `android/app/src/main/res/values/strings.xml`, ensure `tv_app_url` points to your deployed CloudFront / S3 website URL:
```xml
<string name="tv_app_url">https://<your-cloudfront-id>.cloudfront.net/#/tv</string>
<string name="tv_screensaver_url">https://<your-cloudfront-id>.cloudfront.net/#/tv/screensaver</string>
```

### Step 2: Build APK
Using Gradle wrapper:
```bash
./gradlew assembleDebug
```
The output APK is generated at:
`android/app/build/outputs/apk/debug/app-debug.apk`

### Step 3: Install onto Physical Fire TV via ADB
1. On your Fire TV, enable Developer Options:
   **Settings > My Fire TV > Developer Options > ADB Debugging: ON**.
2. Note your Fire TV's IP address: **Settings > My Fire TV > About > Network**.
3. Connect and install from your Mac:
   ```bash
   adb connect 192.168.x.x:5555
   adb install -r android/app/build/outputs/apk/debug/app-debug.apk
   ```
4. On the Fire TV home screen, open **PinBoardTV** or select it as your default screensaver!
