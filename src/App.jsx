import React, { useState, useEffect } from 'react';
import './App.css';

const isExtension = !!(window.chrome && window.chrome.runtime);

function App() {
  const [isEnabled, setIsEnabled] = useState(false);

  useEffect(() => {
    if (isExtension) {
      chrome.storage.sync.get('blurEnabled', (data) => {
        setIsEnabled(!!data.blurEnabled);
      });
    }
  }, []);

  const handleToggleChange = () => {
    const newState = !isEnabled;
    setIsEnabled(newState);

    if (!isExtension) { return; }

    chrome.storage.sync.set({ blurEnabled: newState });

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        const tabUrl = tabs[0].url;
        const tabId = tabs[0].id;

        // --- UPDATED to include Gemini ---
        const isSupportedSite = tabUrl && (
          tabUrl.startsWith("https://chat.openai.com") || 
          tabUrl.startsWith("https://chatgpt.com") || 
          tabUrl.startsWith("https://gemini.google.com")
        );

        if (tabId && isSupportedSite) {
          console.log(`URL check PASSED. Sending message to tab ${tabId}`);
          chrome.tabs.sendMessage(tabId, {
            action: 'setBlur',
            isEnabled: newState,
          });
        } else {
          console.log("URL check failed. The active tab is not a supported page.");
        }
      } else {
        console.error("Could not find a valid active tab.");
      }
    });
  };

  return (
    <div className="App">
      <h2>AI Privacy Guard</h2>
      <div className="toggle-container">
        <label className="switch">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={handleToggleChange}
          />
          <span className="slider round"></span>
        </label>
        <span className="label-text">
          {isEnabled ? 'Blur is ON' : 'Blur is OFF'}
        </span>
      </div>
    </div>
  );
}

export default App;