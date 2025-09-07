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

// Attempt to connect to the native host when the service worker starts
connectNative();
