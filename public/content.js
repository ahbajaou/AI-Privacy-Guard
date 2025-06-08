const BLUR_CLASS_NAME = 'ai-history-blur-active';

// Define the CSS selectors for each site
const siteConfigs = {
  'chatgpt.com': {
    selector: 'nav[aria-label="Chat history"] a > div:first-child'
  },
  'gemini.google.com': {
    // --- UPDATED to be more specific ---
    selector: '.nav-item .text-ellipsis'
  }
};

// Detect which site we are on
const hostname = window.location.hostname;
let activeSelector = null;

if (hostname.includes('chatgpt') || hostname.includes('openai')) {
  activeSelector = siteConfigs['chatgpt.com'].selector;
} else if (hostname.includes('gemini.google')) {
  activeSelector = siteConfigs['gemini.google.com'].selector;
}

// Only proceed if we found a matching site configuration
if (activeSelector) {
  const blurCss = `
    body.${BLUR_CLASS_NAME} ${activeSelector} {
      filter: blur(5px) !important;
      pointer-events: none;
      transition: filter 0.2s ease;
    }

    body.${BLUR_CLASS_NAME} ${activeSelector}:hover {
      filter: blur(0px) !important;
    }
  `;

  // Inject the CSS into the page
  const styleElement = document.createElement('style');
  styleElement.textContent = blurCss;
  document.head.appendChild(styleElement);

  // --- The rest of the logic is the same ---
  const enableBlur = () => { document.body.classList.add(BLUR_CLASS_NAME); };
  const disableBlur = () => { document.body.classList.remove(BLUR_CLASS_NAME); };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'setBlur') {
      message.isEnabled ? enableBlur() : disableBlur();
    }
  });

  chrome.storage.sync.get('blurEnabled', (data) => {
    if (data.blurEnabled) {
      enableBlur();
    }
  });
}