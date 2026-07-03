/**
 * PG Persian RTL Fix — background service worker
 * Updates the toolbar icon color to reflect enabled/disabled state:
 *   Enabled  → purple → mint  gradient (brand colors)
 *   Disabled → orange → red   gradient
 */

const ICON_ON = {
  16:  "icons/icon16.png",
  48:  "icons/icon48.png",
  128: "icons/icon128.png",
};

const ICON_OFF = {
  16:  "icons/icon16-off.png",
  48:  "icons/icon48-off.png",
  128: "icons/icon128-off.png",
};

function updateIcon(enabled) {
  chrome.action.setIcon({ path: enabled ? ICON_ON : ICON_OFF });
}

// Set icon on install/startup based on stored state
function initIcon() {
  chrome.storage.local.get("pgRtlEnabled", (res) => {
    updateIcon(res.pgRtlEnabled !== false);
  });
}

chrome.runtime.onInstalled.addListener(initIcon);
chrome.runtime.onStartup.addListener(initIcon);
initIcon(); // also run immediately when the service worker wakes up

// React instantly whenever the enabled state changes (from the popup toggle)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && "pgRtlEnabled" in changes) {
    updateIcon(changes.pgRtlEnabled.newValue !== false);
  }
});
