const fnButton = document.getElementById("fnButton");
const installButton = document.getElementById("installHelperButton");
const statusEl = document.getElementById("status");

let port = null;

function setStatus(text) {
    if (statusEl) statusEl.textContent = text || "";
}

function applyState(down) {
    if (!fnButton) return;
    if (down) {
        fnButton.classList.add("fn-down");
        fnButton.textContent = "Fn is down";
    } else {
        fnButton.classList.remove("fn-down");
        fnButton.textContent = "Fn is up";
    }
}

function connectToBackground() {
    try {
        port = chrome.runtime.connect({ name: "panel" });
        port.onMessage.addListener((msg) => {
            if (!msg) return;
            if (msg.type === "fn_state") {
                applyState(!!msg.down);
                setStatus("Helper connected");
            }
        });
        port.onDisconnect.addListener(() => {
            port = null;
            setStatus("Helper disconnected");
        });
        port.postMessage({ type: "panel_init" });
        setStatus("Connecting to helper...");
    } catch (e) {
        setStatus("Failed to connect to background");
    }
}

async function installHelper() {
    try {
        const extId = chrome.runtime.id;
        await navigator.clipboard.writeText(extId);
        const downloadUrl =
            "file:///Users/nalin/dev/side_projects/Fn-key/dist/FnKey_Helper_1.0.0.zip";
        chrome.tabs.create({ url: downloadUrl });
        setStatus("Extension ID copied. Opened helper download page.");
    } catch (e) {
        setStatus(
            "Could not copy extension ID. Please copy manually: " +
                chrome.runtime.id
        );
        const downloadUrl =
            "file:///Users/nalin/dev/side_projects/Fn-key/dist/FnKey_Helper_1.0.0.zip"; // fallback open
        chrome.tabs.create({ url: downloadUrl });
    }
}

if (installButton) {
    installButton.addEventListener("click", installHelper);
}

connectToBackground();
