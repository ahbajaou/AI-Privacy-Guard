const BLUR_CLASS_NAME = 'ai-history-blur-active';

// Define the CSS selectors for each site
const siteConfigs = {
    'chatgpt.com': {
        selector: 'nav[aria-label="Chat history"] a > div:first-child > div'
    },
    'gemini.google.com': {
        // --- UPDATED to be more specific ---
        selector: '.conversation-title'
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
      pointer-events: auto !important;
      transition: filter 0.2s ease;
    }

    /* ChatGPT specific hover rules - target individual chat items */
    body.${BLUR_CLASS_NAME} nav[aria-label="Chat history"] a:hover > div:first-child > div {
      filter: blur(0px) !important;
    }
    
    body.${BLUR_CLASS_NAME} nav[aria-label="Chat history"] a:hover ${activeSelector} {
      filter: blur(0px) !important;
    }

    /* Gemini specific hover rules */
    body.${BLUR_CLASS_NAME} .conversation-title:hover {
      filter: blur(0px) !important;
    }

    /* Direct hover on the blurred elements themselves */
    body.${BLUR_CLASS_NAME} ${activeSelector}:hover {
      filter: blur(0px) !important;
    }

    /* Hover on parent link containers */
    body.${BLUR_CLASS_NAME} nav[aria-label="Chat history"] a:hover ${activeSelector} {
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