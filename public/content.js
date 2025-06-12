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

    // Function to get the current site name
    const getCurrentSite = () => {
        if (hostname.includes('chatgpt') || hostname.includes('openai')) {
            return 'ChatGPT';
        } else if (hostname.includes('gemini.google')) {
            return 'Gemini';
        }
        return null;
    };

    // Function to check and apply current blur state
    const checkAndApplyBlurState = () => {
        const site = getCurrentSite();
        if (!site) return;

        const storageKey = `blurEnabled_${site}`;
        chrome.storage.sync.get([storageKey], (data) => {
            if (data[storageKey]) {
                enableBlur();
            } else {
                disableBlur();
            }
        });
    };

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'setBlur') {
            message.isEnabled ? enableBlur() : disableBlur();
        }
    });

    // Check blur state when page loads
    checkAndApplyBlurState();

    // Listen for storage changes for this specific site
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'sync') {
            const site = getCurrentSite();
            if (!site) return;

            const storageKey = `blurEnabled_${site}`;
            if (changes[storageKey]) {
                changes[storageKey].newValue ? enableBlur() : disableBlur();
            }
        }
    });
}