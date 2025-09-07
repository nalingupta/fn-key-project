import Cocoa
import CoreGraphics

// Native Messaging requires messages prefixed with 4-byte little-endian length.
// We'll wrap the simple {"fn":"down"|"up"} payloads accordingly.

func writeNativeMessage(_ dict: [String: String]) {
    do {
        let data = try JSONSerialization.data(withJSONObject: dict, options: [])
        var length = UInt32(data.count)
        let header = withUnsafeBytes(of: &length) { Data($0) } // little-endian on little-endian arch
        FileHandle.standardOutput.write(header)
        FileHandle.standardOutput.write(data)
        try? FileHandle.standardOutput.synchronize()
    } catch {
        // ignore
    }
}

var wasDown = false

// Try NSEvent monitor first
let monitor = NSEvent.addGlobalMonitorForEvents(matching: [.flagsChanged]) { event in
    let isDown = event.modifierFlags.contains(.function)
    if isDown != wasDown {
        wasDown = isDown
        writeNativeMessage(["fn": isDown ? "down" : "up"])
        FileHandle.standardError.write("NSEvent flagsChanged: fn=\(isDown)\n".data(using: .utf8)!)
    }
}

// If NSEvent monitor couldn't be installed or we never see changes, fall back to CGEvent tap.
func startCGEventTapFallback() {
    FileHandle.standardError.write("Starting CGEvent tap fallback...\n".data(using: .utf8)!)
    let mask = (1 << CGEventType.flagsChanged.rawValue)
    let callback: CGEventTapCallBack = { _, type, event, _ in
        if type == .flagsChanged {
            let flags = event.flags
            // maskSecondaryFn is available on modern macOS; fallback to .maskNonCoalesced if needed
            let isDown: Bool
            if flags.contains(.maskSecondaryFn) {
                isDown = true
            } else {
                // Not strictly accurate, but if secondaryFn isn't exposed, infer via keycode 63 sometimes
                isDown = false
            }
            if isDown != wasDown {
                wasDown = isDown
                writeNativeMessage(["fn": isDown ? "down" : "up"])
                FileHandle.standardError.write("CGEvent flagsChanged: fn=\(isDown)\n".data(using: .utf8)!)
            }
        }
        return Unmanaged.passUnretained(event)
    }

    guard let tap = CGEvent.tapCreate(
        tap: .cgSessionEventTap,
        place: .headInsertEventTap,
        options: .defaultTap,
        eventsOfInterest: CGEventMask(mask),
        callback: callback,
        userInfo: nil
    ) else {
        FileHandle.standardError.write("Failed to create CGEvent tap.\n".data(using: .utf8)!)
        return
    }
    let rl = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
    CFRunLoopAddSource(CFRunLoopGetCurrent(), rl, .commonModes)
    CGEvent.tapEnable(tap: tap, enable: true)
}

// Heuristic: if NSEvent monitor is nil, or if no changes observed after short delay, start fallback.
if monitor == nil {
    writeNativeMessage(["error": "input_monitoring_permission_required"]) 
    startCGEventTapFallback()
} else {
    DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
        if wasDown == false { // if no change yet, still start fallback to broaden coverage
            startCGEventTapFallback()
        }
    }
}

RunLoop.main.run()


