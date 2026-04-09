// Offscreen document message handler.
// Service workers have no DOM, so image dimension measurement is delegated here.
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.action === "measureImage") {
        var img = document.createElement("img");
        img.onload = function() {
            sendResponse({ width: img.width, height: img.height });
        };
        img.onerror = function() {
            sendResponse({ error: "Failed to load image" });
        };
        img.src = message.dataUrl;
        // Keep the message channel open for the async response.
        return true;
    }
});
