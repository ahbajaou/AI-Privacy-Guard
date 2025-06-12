chrome.runtime.onInstalled.addListener((details) => {
  
  if (details.reason === 'install') {
    
    // Query all tabs to find supported sites
    chrome.tabs.query({}, (tabs) => {
      
      tabs.forEach((tab) => {
        if (tab.url) {
          const isSupportedSite = 
            tab.url.startsWith("https://chat.openai.com") ||
            tab.url.startsWith("https://chatgpt.com") ||
            tab.url.startsWith("https://gemini.google.com");
          
          if (isSupportedSite) {
            chrome.tabs.reload(tab.id);
          }
        }
      });
    });
  }
});