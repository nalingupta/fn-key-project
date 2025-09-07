# Architecture: Fn Key → Chrome Extension UI Integration

This document explains the end-to-end design and implementation to reflect macOS Fn key state inside a Chrome extension. It is written to be reusable in other projects and includes exact file paths, APIs, and commands.

## Goals

-   Detect macOS Fn key down/up globally and deliver it to a Chrome MV3 extension in real time.
-   Toggle a side-panel button color: red (idle) → blue (while Fn is held) → red (on release).
-   Simple installation for users; robust on modern macOS and Chrome.
-   Coexist with any other app that also reacts to Fn (no suppression).

## High-level Overview

```
[macOS Keyboard] → [Helper (Swift)] → Native Messaging (stdio + 4B length) →
[Chrome Service Worker]
   ↳ Port → [Side Panel Page] (button)
   ↳ tabs.sendMessage → [Content Script] (top-of-page overlay)
```

-   A small native helper observes system-wide modifier changes and emits JSON messages with 4‑byte little‑endian length prefix (Chrome Native Messaging framing).
-   A MV3 background service worker connects to the helper (native host) and relays the Fn state to the side panel via a `chrome.runtime.connect` port, and to tabs via `chrome.tabs.sendMessage`.
-   The side panel updates an on-screen button; the content script renders a thin blue overlay at the top of each eligible page.

## Components and Files

Extension (MV3)

-   `manifest.json` — declares `nativeMessaging`, sets background service worker, defines side panel path.
-   `background.js` — connects to the native host, receives Fn events, and broadcasts them to the side panel.
-   `sidepanel.html` — minimal UI with a status line, a primary button (red/blue), and an "Install Helper" button.
-   `sidepanel.js` — connects to the background, updates the button on events, and opens the helper download.

Native (macOS)

-   `mac/fnkey-host/Package.swift` — SwiftPM configuration for the console host.
-   `mac/fnkey-host/Sources/main.swift` — implements two monitoring strategies and Native Messaging framing.
-   `mac/FnKey Helper.app` — app bundle that contains the `fnkey-host` executable (same binary); facilitates correct macOS permissions.
-   `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/nullin_fnkeyhelper_try.json` — user-scope native host manifest (Chrome-only target).

Packaging and System Integration

-   `dist/FnKey_Helper_1.0.0.zip` — distributable archive of the helper app.
-   `~/Library/LaunchAgents/com.nullin.fnkeyhelper.try.plist` — optional LaunchAgent to auto-start the helper at login.

## Data Contracts

Native Messaging framing

-   Each message is: `[4-byte little-endian length][UTF-8 JSON payload]` on stdout.
-   Payloads used:
    -   `{"fn":"down"}` — Fn key pressed/held.
    -   `{"fn":"up"}` — Fn key released.
    -   Optional one-time diagnostic: `{"error":"input_monitoring_permission_required"}`.

Extension messaging

-   Background → Side panel: `{"type":"fn_state","down":boolean}` via a long-lived `chrome.runtime.Port` named `panel`.

## macOS Helper Details

Monitoring strategies

1. NSEvent Global Monitor

-   `NSEvent.addGlobalMonitorForEvents(matching: [.flagsChanged])`
-   Detects Fn with `event.modifierFlags.contains(.function)`.
-   Requires macOS Input Monitoring permission.

2. CGEvent Tap (Fallback)

-   `CGEvent.tapCreate(..., eventsOfInterest: flagsChanged)`
-   Detect Fn using `.maskSecondaryFn` when available (guarded by macOS version/hardware).
-   May trigger macOS Accessibility permission.

Fallback logic

-   Attempt NSEvent monitor first; if it fails or seems inactive, enable CGEvent tap and log to stderr.
-   Both paths publish identical Fn messages to stdout using Native Messaging framing.

Permissions

-   Input Monitoring is required (first time grant per app bundle/executable).
-   Accessibility may be requested only if the CGEvent tap fallback is used.

Why an App Bundle?

-   macOS TCC (privacy) prompts are more reliable with a signed app bundle than with a bare CLI launched by Chrome. The app bundle embeds the exact `fnkey-host` executable used by the native host manifest.

## Chrome Extension Details (MV3)

Background (service worker)

-   Connects to the host by name `nullin_fnkeyhelper_try` with `chrome.runtime.connectNative(name)`.
-   Keeps `fnDown` boolean state.
-   Broadcasts state changes to any connected side panel port(s) and to active tabs.
-   Reconnects on disconnect with simple backoff.

Side Panel Page

-   On load, opens a port with `chrome.runtime.connect({ name: "panel" })` and sends `panel_init` to receive the initial state.
-   Listens for `fn_state` and updates the button color/text:
    -   `.fn-down` class applied when down → blue; removed when up → red.
-   "Install Helper" button copies `chrome.runtime.id` and opens a download URL (local file during dev, HTTPS in production).

Content Script Overlay

-   Registered in `manifest.json` under `content_scripts` for `<all_urls>` at `document_start`.
-   Injects a single `<div id="fn-overlay">` with `position:fixed;top:0;left:0;right:0;height:8px;background:#3b82f6;z-index:2147483647;pointer-events:none;`.
-   Toggling is done by switching `opacity` between `0` and `1` on `{ type: "fn_state", down }`.
-   Performs a handshake at load by sending `{ type: "content_init" }` and applying the returned `down` state.
-   Handles early DOM states by deferring append to `DOMContentLoaded` when needed.

## Native Host Manifest (Chrome only)

Path: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/nullin_fnkeyhelper_try.json`

```json
{
    "name": "nullin_fnkeyhelper_try",
    "description": "Fn key state broadcaster",
    "path": "/Users/<user>/dev/side_projects/Fn-key/mac/FnKey Helper.app/Contents/MacOS/fnkey-host",
    "type": "stdio",
    "allowed_origins": ["chrome-extension://lkklablmlgcpddaikbdildmkjbhpcmij/"]
}
```

Notes

-   `allowed_origins` must include the real extension ID.
-   `path` must be absolute and executable by the user.

## Build and Bundle

Swift host (SwiftPM)

-   Build: `cd mac/fnkey-host && DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift build -c release`
-   Output: `mac/fnkey-host/.build/release/fnkey-host`

App bundle

-   Structure:
    -   `FnKey Helper.app/Contents/Info.plist`
    -   `FnKey Helper.app/Contents/MacOS/fnkey-host`
-   Required Info.plist keys: `CFBundleIdentifier`, `CFBundleExecutable`, `CFBundlePackageType=APPL`, `LSUIElement=true` (no dock), optionally `LSBackgroundOnly`.
-   Ad-hoc sign for local use: `codesign --force --sign - "FnKey Helper.app"`.

Packaging

-   Zip the app for distribution: `zip -qry dist/FnKey_Helper_1.0.0.zip "FnKey Helper.app"`
-   Provide SHA256 and file size for integrity checks.

Autostart (optional)

-   LaunchAgent at `~/Library/LaunchAgents/com.nullin.fnkeyhelper.try.plist`:
    -   `ProgramArguments`: `open -a /path/to/FnKey Helper.app`
    -   `RunAtLoad: true`
    -   Logs: `~/Library/Logs/fnkeyhelper.{out,err}.log`
-   Manage with `launchctl load -w`, `launchctl unload`, `launchctl kickstart`.

## Security and Privacy

-   The helper only emits Fn modifier state; no keystrokes are captured or logged.
-   All data stays on device; no network involved.
-   Permissions requested:
    -   Input Monitoring (always)
    -   Accessibility (only if CGEvent tap activated)

## Troubleshooting Guide

-   Button doesn’t change:
    -   Ensure `FnKey Helper` is enabled in System Settings → Privacy & Security → Input Monitoring (and Accessibility if requested).
    -   Verify host process is running from app bundle: `ps aux | grep "FnKey Helper.app/Contents/MacOS/fnkey-host"`.
    -   Confirm manifest `path` exists and `allowed_origins` has the correct extension ID.
-   No permission prompt:
    -   Launch the app directly once (`open -a "FnKey Helper.app"`) to force TCC to evaluate and prompt.
-   Multiple Chrome profiles:
    -   Manifest is per-user; `allowed_origins` ties to a specific extension ID. Repeat install per profile/ID as needed.

## Portability Notes (Adapting to Other Projects)

-   The extension portion is browser-portable across MV3 Chromium derivatives that support Native Messaging and Side Panel APIs (Side Panel is Chrome-specific; use an alternatives UI otherwise).
-   The helper approach works on macOS. On Windows/Linux, replace the helper implementation and host manifest locations accordingly.
-   The Fn key is platform-specific; on other OSes you may map to another modifier or use a different API to detect hardware-layer keys.

## Step-by-step Reuse Checklist

1. Clone the extension skeleton and rename.
2. Update `manifest.json` (name/description), keep `nativeMessaging` permission.
3. Keep `background.js` and `sidepanel.*` wiring; change UI as needed.
4. Build the Swift host (or equivalent for target OS) and create an app bundle.
5. Install the native host manifest with the correct `path` and `allowed_origins`.
6. Launch the app once to obtain permissions; restart Chrome.
7. Open the side panel; verify Fn toggles the button.
8. Package, sign, notarize; publish a download; update the panel’s install URL.

## Rationale for Key Decisions

-   Native Messaging chosen for reliability and security; Chrome spawns the helper as needed.
-   App bundle is used to obtain TCC permissions consistently.
-   CGEvent tap fallback covers hardware/models where NSEvent `.function` flag is not exposed.
-   Service worker broadcasts via `Port` to avoid direct/background DOM access and to support multiple side panel instances.

## Known Limitations

-   Requires macOS permissions and a small helper app (not purely web).
-   Fn flag availability can vary by hardware/macOS version; hence the fallback.
-   If the other application remaps Fn at a very low level, the helper may need tailoring.

## Future Enhancements

-   Installer app that writes the manifest and places the app and LaunchAgent automatically.
-   Signed/notarized distribution and auto-update.
-   In-panel status indicator for permissions with one-click open of System Settings.
-   Telemetry-free diagnostics page for easy troubleshooting.
