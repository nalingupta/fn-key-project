chrome.runtime.onInstalled.addListener(() => {
    if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
        chrome.sidePanel
            .setPanelBehavior({ openPanelOnActionClick: true })
            .catch(() => {});
    }
});

// Native messaging connection and side panel relay
let nativePort = null;
let panelPorts = new Set();
let fnDown = false;

function broadcastFnState(isDown) {
    for (const port of panelPorts) {
        try {
            port.postMessage({ type: "fn_state", down: !!isDown });
        } catch (e) {
            // noop
        }
    }
    // Also broadcast to active tabs in each window to minimize overhead
    try {
        chrome.tabs.query({ active: true }, (tabs) => {
            for (const t of tabs || []) {
                if (!t.id) continue;
                chrome.tabs.sendMessage(
                    t.id,
                    { type: "fn_state", down: !!isDown },
                    () => {
                        void chrome.runtime.lastError;
                    }
                );
            }
        });
    } catch (_) {}
}

function sendFnStateToTab(tabId, isDown) {
    try {
        chrome.tabs.sendMessage(
            tabId,
            { type: "fn_state", down: !!isDown },
            () => {
                void chrome.runtime.lastError;
            }
        );
    } catch (_) {}
}

function connectNative() {
    try {
        nativePort = chrome.runtime.connectNative("nullin_fnkeyhelper_try");
    } catch (e) {
        nativePort = null;
        setTimeout(connectNative, 1000);
        return;
    }

    nativePort.onMessage.addListener((msg) => {
        if (!msg) return;
        if (msg.fn === "down") {
            if (!fnDown) {
                fnDown = true;
                broadcastFnState(true);
            }
        } else if (msg.fn === "up") {
            if (fnDown) {
                fnDown = false;
                broadcastFnState(false);
            }
        }
    });

    nativePort.onDisconnect.addListener(() => {
        nativePort = null;
        setTimeout(connectNative, 1000);
    });
}

chrome.runtime.onConnect.addListener((port) => {
    if (port.name === "panel") {
        panelPorts.add(port);
        port.onMessage.addListener((msg) => {
            if (msg && msg.type === "panel_init") {
                port.postMessage({ type: "fn_state", down: fnDown });
            }
        });
        port.onDisconnect.addListener(() => {
            panelPorts.delete(port);
        });
    }
});

// Respond to content scripts requesting the current state
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "content_init") {
        sendResponse({ type: "fn_state", down: fnDown });
        return true;
    }
});

// Keep newly activated tabs synchronized with current state
chrome.tabs.onActivated.addListener(({ tabId }) => {
    sendFnStateToTab(tabId, fnDown);
});

// After a tab finishes loading, ensure overlay reflects current state
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete") {
        sendFnStateToTab(tabId, fnDown);
    }
});

// Attempt to connect to the native host when the service worker starts
connectNative();
