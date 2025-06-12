import React, { useState, useEffect } from 'react';
import { FaGithub } from 'react-icons/fa';
import './App.css';

const isExtension = !!(window.chrome && window.chrome.runtime);

function App() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [currentSite, setCurrentSite] = useState('');

  useEffect(() => {
    if (isExtension) {
      // Get current tab info first
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]) {
          const tabUrl = tabs[0].url;
          let site = '';

          if (tabUrl.startsWith("https://chat.openai.com") || tabUrl.startsWith("https://chatgpt.com")) {
            site = 'ChatGPT';
            setCurrentSite('ChatGPT');
          } else if (tabUrl.startsWith("https://gemini.google.com")) {
            site = 'Gemini';
            setCurrentSite('Gemini');
          } else {
            site = 'Unsupported';
            setCurrentSite('Unsupported');
          }

          // Get blur state for this specific site
          if (site !== 'Unsupported') {
            const storageKey = `blurEnabled_${site}`;
            chrome.storage.sync.get([storageKey], (data) => {
              setIsEnabled(!!data[storageKey]);
            });
          } else {
            setIsEnabled(false);
          }
        }
      });
    }
    // Remove the Ko-fi script loading - it won't work in extensions
  }, []);

  const handleToggleChange = () => {
    const newState = !isEnabled;
    setIsEnabled(newState);

    if (!isExtension || currentSite === 'Unsupported') { return; }

    // Store setting per site
    const storageKey = `blurEnabled_${currentSite}`;
    chrome.storage.sync.set({ [storageKey]: newState });

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        const tabUrl = tabs[0].url;
        const tabId = tabs[0].id;

        const isSupportedSite = tabUrl && (
          tabUrl.startsWith("https://chat.openai.com") ||
          tabUrl.startsWith("https://chatgpt.com") ||
          tabUrl.startsWith("https://gemini.google.com")
        );

        if (tabId && isSupportedSite) {
          chrome.tabs.sendMessage(tabId, {
            action: 'setBlur',
            isEnabled: newState,
          });
        }
      }
    });
  };

  const getSiteIcon = () => {
    switch (currentSite) {
      case 'ChatGPT':
        return '🤖';
      case 'Gemini':
        return '✨';
      default:
        return '🚫';
    }
  };

  return (
    <div className="app">
      <div className="header">
        <div className="logo">
          <div className="shield-icon">🛡️</div>
          <h1>AI Privacy Guard</h1>
        </div>
        <div className="version">v1.0</div>
      </div>

      <div className="status-card">
        <div className="site-info">
          <span className="site-icon">{getSiteIcon()}</span>
          <div className="site-details">
            <span className="site-name">{currentSite}</span>
            <span className={`site-status ${currentSite !== 'Unsupported' ? 'supported' : 'unsupported'}`}>
              {currentSite !== 'Unsupported' ? 'Supported' : 'Not Supported'}
            </span>
          </div>
        </div>
      </div>

      <div className="control-section">
        <div className="toggle-header">
          <h3>Privacy Protection</h3>
          <p>Blur sensitive content while typing</p>
        </div>

        <div className="toggle-container">
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={handleToggleChange}
              disabled={currentSite === 'Unsupported'}
            />
            <span className="slider"></span>
          </label>
          <div className="toggle-status">
            <span className={`status-text ${isEnabled ? 'active' : 'inactive'}`}>
              {isEnabled ? 'Protection ON' : 'Protection OFF'}
            </span>
            <div className={`status-indicator ${isEnabled ? 'on' : 'off'}`}></div>
          </div>
        </div>

        {currentSite === 'Unsupported' && (
          <div className="warning-message">
            <span className="warning-icon">⚠️</span>
            Navigate to ChatGPT or Gemini to use this extension
          </div>
        )}

        {/* GitHub Repository Link */}
        {/* GitHub Repository Link */}
        <div className="support-section">
          <a
            href="https://github.com/ahbajaou/AI-Privacy-Guard"
            target="_blank"
            rel="noopener noreferrer"
            className="github-button"
          >
            <FaGithub size={20} color='#fff' />
            <span style={{ marginLeft: '8px' }} >GitHub</span>
          </a>
        </div>
      </div>
      <div className='allrights'>
        <span>© 2025 Cheb2ub. All Rights Reserved</span>
      </div>
    </div>
  );
}

export default App;