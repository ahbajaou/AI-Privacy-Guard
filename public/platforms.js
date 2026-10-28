// Shared by the classic content script and the bundled React popup.
globalThis.AIPG_PLATFORMS = Object.freeze([
  Object.freeze({
    id: 'ChatGPT',
    name: 'ChatGPT',
    hostnames: Object.freeze(['chatgpt.com', 'chat.openai.com']),
    urlPrefixes: Object.freeze([
      'https://chatgpt.com/',
      'https://chat.openai.com/',
    ]),
    storageKey: 'blurEnabled_ChatGPT',
    // Sanitized Brave diagnostics found one navigation landmark without the old
    // sidebar testid. Live testing also confirmed project-scoped /g/{id}/c/{id}.
    sidebarSelector: 'nav[role="navigation"]',
    conversationSelector: 'nav[role="navigation"] a[href^="/c/"], nav[role="navigation"] a[href^="/g/"][href*="/c/"]',
    // Current project headers are interactive rows, not /g/ links. Runtime
    // classification marks only their title row after verifying its controls.
    projectSelector: 'nav[role="navigation"] [data-aipg-chatgpt-project-row], nav[role="navigation"] a[href^="/g/"]:not([href*="/c/"]), nav[role="navigation"] a[href^="/projects/"], nav[role="navigation"] a[href^="/project/"]',
    titleSelector: 'nav[role="navigation"] a[href^="/c/"], nav[role="navigation"] a[href^="/g/"][href*="/c/"]',
    sensitiveSelector: 'nav[role="navigation"] a[href^="/c/"], nav[role="navigation"] a[href^="/g/"][href*="/c/"], nav[role="navigation"] [data-aipg-chatgpt-project-row], nav[role="navigation"] a[href^="/g/"]:not([href*="/c/"]), nav[role="navigation"] a[href^="/projects/"], nav[role="navigation"] a[href^="/project/"]',
    identitySelector: null,
  }),
  Object.freeze({
    id: 'Gemini',
    name: 'Gemini',
    hostnames: Object.freeze(['gemini.google.com']),
    urlPrefixes: Object.freeze(['https://gemini.google.com/']),
    storageKey: 'blurEnabled_Gemini',
    // The live DOM confirms bard-sidenav is the navigation root. The exact
    // history rows expose a verified title leaf under four nested spans.
    sidebarSelector: 'bard-sidenav[role="navigation"]',
    titleSelector: 'bard-sidenav[role="navigation"] [data-aipg-gemini-conversation-title], bard-sidenav[role="navigation"] [data-aipg-gemini-project-title]',
    conversationSelector: 'bard-sidenav[role="navigation"] [data-aipg-gemini-conversation-title]',
    projectSelector: 'bard-sidenav[role="navigation"] [data-aipg-gemini-project-title]',
    sensitiveSelector: 'bard-sidenav[role="navigation"] [data-aipg-gemini-conversation-title], bard-sidenav[role="navigation"] [data-aipg-gemini-project-title]',
    identitySelector: null,
  }),
  Object.freeze({
    id: 'Claude',
    name: 'Claude',
    hostnames: Object.freeze(['claude.ai']),
    urlPrefixes: Object.freeze(['https://claude.ai/']),
    storageKey: 'blurEnabled_Claude',
    sidebarSelector: null,
    // Candidate based on Claude chat routes; this is deliberately not marked
    // live-verified and the UI must not claim that protection succeeded.
    titleSelector: 'a[href^="/chat/"]',
    liveVerified: false,
    identitySelector: null,
  }),
]);

globalThis.AIPG_HOVER_STORAGE_KEY = 'hoverRevealEnabled';
globalThis.AIPG_SAFE_MODE_STORAGE_KEY = 'presentationSafeModeEnabled';
