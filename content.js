(function () {
    try {
        if (
            document.contentType &&
            document.contentType.indexOf("text/html") === -1
        ) {
            return; // skip non-HTML docs like PDFs
        }
    } catch (_) {}

    function ensureOverlay() {
        let el = document.getElementById("fn-overlay");
        if (!el) {
            el = document.createElement("div");
            el.id = "fn-overlay";
            el.setAttribute(
                "style",
                "position:fixed;top:0;left:0;right:0;height:36px;background:#2563eb;" +
                    "display:flex;align-items:center;justify-content:flex-end;padding:4px 8px;" +
                    "box-sizing:border-box;z-index:2147483647;pointer-events:auto;opacity:0;transition:opacity 80ms ease;"
            );
            // Add button inside overlay
            const btn = document.createElement("button");
            btn.id = "fn-open-panel-btn";
            btn.textContent = "Open Panel";
            btn.setAttribute(
                "style",
                "background:#1e40af;color:#fff;border:none;border-radius:4px;padding:6px 10px;" +
                    "font-size:12px;cursor:pointer;"
            );
            btn.addEventListener("click", () => {
                try {
                    console.log("fn-overlay: open_sidepanel click");
                    chrome.runtime.sendMessage({ type: "open_sidepanel" });
                } catch (e) {
                    console.warn("fn-overlay: sendMessage failed", e);
                }
            });
            el.appendChild(btn);
            if (document.documentElement) {
                document.documentElement.appendChild(el);
            } else {
                (document.addEventListener
                    ? document
                    : window
                ).addEventListener(
                    "DOMContentLoaded",
                    () => {
                        if (!document.getElementById("fn-overlay")) {
                            document.documentElement.appendChild(el);
                        }
                    },
                    { once: true }
                );
            }
        }
        return el;
    }

    function setOverlayVisible(isVisible) {
        const el = ensureOverlay();
        el.style.opacity = isVisible ? "1" : "0";
    }

    chrome.runtime.onMessage.addListener((msg) => {
        if (msg && msg.type === "fn_state") {
            setOverlayVisible(!!msg.down);
        }
    });

    function requestInitialState() {
        try {
            chrome.runtime.sendMessage({ type: "content_init" }, (resp) => {
                if (resp && typeof resp.down === "boolean") {
                    setOverlayVisible(resp.down);
                }
            });
        } catch (_) {}
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", requestInitialState, {
            once: true,
        });
    } else {
        requestInitialState();
    }
})();
