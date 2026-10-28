const SAFE_MODE_KEY = 'presentationSafeModeEnabled';

const setCommandBadge = (text) => {
  try {
    chrome.action.setBadgeText({ text }, () => {
      // Consume lastError in the callback so it does not become an unhandled
      // extension API error. The popup remains the primary status surface.
      void chrome.runtime.lastError;
    });
  } catch {
    // Badge feedback is optional; the persisted setting remains authoritative.
  }
};

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'toggle-presentation-safe-mode') return;

  try {
    chrome.storage.local.get([SAFE_MODE_KEY], (settings) => {
      if (chrome.runtime.lastError) {
        setCommandBadge('!');
        return;
      }

      const enabled = settings?.[SAFE_MODE_KEY] !== true;
      chrome.storage.local.set({ [SAFE_MODE_KEY]: enabled }, () => {
        if (chrome.runtime.lastError) setCommandBadge('!');
        else setCommandBadge(enabled ? 'SAFE' : '');
      });
    });
  } catch {
    setCommandBadge('!');
  }
});
