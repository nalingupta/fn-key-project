# Fn-key Side Panel Extension

Chrome extension + macOS helper that turns a side panel button blue while the Fn key is held and red when released.

## User install (Chrome + macOS helper)

1. Load the extension
    - Open `chrome://extensions/` in Chrome.
    - Enable Developer mode.
    - Click "Load unpacked" and select `/Users/nalin/dev/side_projects/Fn-key`.
2. Open the side panel (click the extension action).
3. Click "Install Helper" in the panel. This opens a ZIP containing `FnKey Helper.app`.
4. Unzip and open `FnKey Helper.app`.
5. Grant macOS permissions when prompted (first run only):
    - Privacy & Security → Input Monitoring → enable `FnKey Helper`.
    - If also prompted for Accessibility, enable `FnKey Helper` there, too.
6. Return to Chrome. While the side panel is optional now:
    - Side panel button toggles blue/red while Fn is held (as before).
    - New: A thin blue bar appears at the top of normal web pages when Fn is held, even if the side panel is closed.

## Permissions

-   macOS Input Monitoring (required to observe Fn). Optional Accessibility prompt if the fallback CGEvent tap is used.
-   Chrome permission: `nativeMessaging`.

## Developer setup

1. Prereqs
    - Xcode installed (toolchain for Swift).
    - Python 3 for the optional simulator.
2. Build the helper (SwiftPM)
    - `cd mac/fnkey-host && DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift build -c release`
    - Output: `mac/fnkey-host/.build/release/fnkey-host`
3. Create the app bundle (already scripted here)
    - App path: `mac/FnKey Helper.app`
    - Executable: `FnKey Helper.app/Contents/MacOS/fnkey-host`
4. Native Messaging host manifest
    - Path: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/nullin_fnkeyhelper_try.json`
    - `name`: `nullin_fnkeyhelper_try`
    - `path`: `/Users/<you>/dev/side_projects/Fn-key/mac/FnKey Helper.app/Contents/MacOS/fnkey-host`
    - `allowed_origins`: `["chrome-extension://lkklablmlgcpddaikbdildmkjbhpcmij/"]`
5. Packaging
    - `dist/FnKey_Helper_1.0.0.zip` contains the app.
    - SHA256: `d594199cb4aff94a682273fcafc76d8cc7b58e8383a6a0dd7d859abd814181d2`

## Optional: Simulator (no macOS permissions)

-   File: `tools/native_host_sim.py` (create if missing). It writes length‑prefixed JSON for Native Messaging.
-   Point the manifest `path` to the simulator, restart Chrome, and run the script with `--pulse` or press Enter to toggle.

## Autostart (optional)

-   LaunchAgent: `~/Library/LaunchAgents/com.nullin.fnkeyhelper.try.plist` launches the app at login.
-   Manage:
    -   Load: `launchctl load -w ~/Library/LaunchAgents/com.nullin.fnkeyhelper.try.plist`
    -   Unload: `launchctl unload ~/Library/LaunchAgents/com.nullin.fnkeyhelper.try.plist`

## Troubleshooting

-   Button doesn’t change:
    -   Ensure `FnKey Helper` is enabled in Input Monitoring (and Accessibility if prompted).
    -   Check that the native host process is running from the app bundle.
        -   `ps aux | grep "FnKey Helper.app/Contents/MacOS/fnkey-host"`
    -   Verify manifest `allowed_origins` includes your extension ID.
-   Rebuild after code change:
    -   Rebuild `fnkey-host`, re‑copy into `FnKey Helper.app`, re‑sign (ad‑hoc is fine locally), restart Chrome.

## Notes

-   Requires recent Chrome with Side Panel API support. Content scripts do not run on restricted pages (e.g., chrome://, Web Store, PDFs), so the blue bar won’t appear there.
-   Data stays local; no keystrokes are logged beyond Fn state transitions.
